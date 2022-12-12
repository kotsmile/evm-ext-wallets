import type { EvmConfig } from 'evm-ext/lib/config/type'

import { WalletHandler } from 'evm-ext/lib/modules/wallet/wallets/base'
import type {
  ChangeChainCallbackFunction,
  ChangeWalletCallbackFunction,
  UpdateStoreStateFunction,
} from 'evm-ext/lib/modules/wallet/wallets/base'

import { getRpc_config } from 'evm-ext/lib/modules/chain/node'
import type { utils } from 'evm-ext'
import { events, methods } from './utils'
import {
  getChainDescription,
  getChainHex,
  getChainName,
  getChainScanner,
} from 'evm-ext/lib/utils/chain'

type ChainId = utils.chain.ChainId

export class Metamask extends WalletHandler {
  constructor(
    public config: EvmConfig,
    public chainIds: readonly ChainId[],
    public defaultChainId: ChainId,
    public updateStoreState: UpdateStoreStateFunction,
    public changeWalletCallback?: ChangeWalletCallbackFunction,
    public changeChainCallback?: ChangeChainCallbackFunction
  ) {
    super(
      config,
      chainIds,
      defaultChainId,
      updateStoreState,
      changeWalletCallback,
      changeChainCallback
    )
    const ehtProvider = (window as any).ethereum

    if (ehtProvider.providers)
      this.nativeProvider = ehtProvider.providers.find(
        (provider: any) => provider.isMetaMask
      )
    else this.nativeProvider = ehtProvider

    if (!this.nativeProvider) {
      throw new Error('Please set up MetaMask properly')
    }

    this.nativeProvider.once(events.CHANGE_WALLET, this.changeWalletHanlder?.bind(this))
    this.nativeProvider.once(events.CHANGE_CHAIN, this.changeChainHandler?.bind(this))
  }

  async connect(): Promise<boolean> {
    try {
      this.address = (
        await this.nativeProvider.request({ method: methods.REQUEST_ACCOUNT })
      )[0] as string

      await this.updateProviderState()

      if (!this.chainId) return false

      if (
        !(this.chainIds as string[]).includes(this.chainId) &&
        !this.config.options?.preventDefaultChangeChain
      ) {
        await this.switchChain(this.defaultChainId)
      }

      return true
    } catch (error) {
      if (parseInt((error as any).code) == 4001) {
        alert('Please connect to MetaMask.')
      } else {
        console.error(error)
      }
      return false
    }
  }

  async switchChain(chainId: ChainId): Promise<boolean> {
    try {
      await this.nativeProvider.request?.({
        method: methods.SWITCH_CHAIN,
        params: [{ chainId: getChainHex(chainId) }],
      })
      await this.updateProviderState()
      return true
    } catch (error) {
      if (parseInt((error as any).code) == 4902) return await this.addChain(chainId)
    }
    return false
  }

  async addChain(chainId: ChainId): Promise<boolean> {
    try {
      const param = {
        chainId: getChainHex(chainId),
        chainName: getChainName(chainId),
        nativeCurrency: {
          name: getChainDescription(chainId).symbol,
          symbol: getChainDescription(chainId).symbol,
          decimals: 18,
        },
        rpcUrls: [getRpc_config(this.config)(chainId)],
        blockExplorerUrls: getChainScanner(chainId) ? [getChainScanner(chainId)] : null,
      }
      await this.nativeProvider.request?.({
        method: methods.ADD_CHAIN,
        params: [param],
      })
      return true
    } catch (addError) {
      console.error(addError)
      return false
    }
  }

  async disconnect(): Promise<boolean> {
    this.clear()
    return true
  }
}

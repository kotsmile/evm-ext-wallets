import WalletConnectProvider from '@walletconnect/web3-provider'

import type { EvmConfig } from 'evm-ext/lib/config/type'

import { WalletHandler } from 'evm-ext/lib/modules/wallet/wallets/base'
import type {
  ChangeChainCallbackFunction,
  ChangeWalletCallbackFunction,
  UpdateStoreStateFunction,
} from 'evm-ext/lib/modules/wallet/wallets/base'

import { getRpc_config } from 'evm-ext/lib/modules/chain/node'
import type { utils } from 'evm-ext'
import { safe } from 'evm-ext'
import { events, methods } from './utils'
import {
  getChainDescription,
  getChainHex,
  getChainName,
  getChainScanner,
  chainIds as allChainIds,
} from 'evm-ext/lib/utils/chain'
import { keyOf } from 'evm-ext/lib/utils'

type ChainId = utils.chain.ChainId

export class Walletconnect extends WalletHandler {
  public appName!: string

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
    const rpc = {} as { [key: number]: string }

    for (const chainTag of keyOf(allChainIds)) {
      const chainId =
        `${allChainIds[chainTag]}` as `${typeof allChainIds[typeof chainTag]}`
      rpc[parseInt(chainId)] = getRpc_config(config)(chainId)
    }

    this.nativeProvider = new WalletConnectProvider({
      rpc,
      chainId: parseInt(defaultChainId),
      qrcode: true,
      pollingInterval: 150000,
    })
  }

  async connect(): Promise<boolean> {
    try {
      await this.nativeProvider.enable().catch(console.error)

      this.appName = this.nativeProvider.wc._peerMeta.name
      await this.updateProviderState()

      if (!this.chainId) return false

      if (
        !(this.chainIds as string[]).includes(this.chainId) &&
        !this.config.options?.preventDefaultChangeChain
      ) {
        await this.switchChain(this.defaultChainId)
      }

      this.nativeProvider.once(events.CHANGE_WALLET, this.changeWalletHanlder?.bind(this))
      this.nativeProvider.once(events.CHANGE_CHAIN, this.changeChainHandler?.bind(this))

      const disconnectHandler = async () => {
        if (!this.actual) return
        this.updateStoreState({
          signer: null,
          wallet: '',
          chainId: this.defaultChainId,
          login: false,
        })
        this.nativeProvider.once(events.DISCONNECT, async () => await disconnectHandler())
      }

      this.nativeProvider.once(events.DISCONNECT, async () => await disconnectHandler())
      return true
    } catch (error) {
      console.error(error)
      return false
    } finally {
    }
  }
  clear() {
    super.clear()
    this.nativeProvider.removeListener(events.DISCONNECT, async () => {
      this.updateStoreState({
        signer: null,
        wallet: '',
        chainId: this.defaultChainId,
        login: false,
      })
    })
  }

  async switchChain(chainId: ChainId): Promise<boolean> {
    if ((await this.getChainId()) === (chainId as string)) {
      return false
    }
    if (this.appName.includes('Trust Wallet')) {
      return false
    }

    console.log('Sending request to change chain')

    const [res, err] = await safe(
      this.nativeProvider.request({
        method: methods.SWITCH_CHAIN,
        params: [{ chainId: getChainHex(chainId) }],
      })
    )
    if (err) {
      const errorMessage = (err as any).message.replace(/ "[^]*"/, '')
      switch (errorMessage) {
        case 'User rejected the request.':
          return false
        case 'Unrecognized chain ID. Try adding the chain using wallet_addEthereumChain first.':
          await this.addChain(chainId)
          return true
      }
    }
    return true
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
      const resp = await this.nativeProvider.request({
        method: methods.ADD_CHAIN,
        params: [param],
      })
      console.log(resp)
      return true
    } catch (addError) {
      console.log(addError)
      return false
    }
  }

  async disconnect() {
    this.clear()
    await this.nativeProvider.disconnect()
    return true
  }

  async getSigner() {
    return this.provider?.getSigner() ?? null
  }

  async getAddress() {
    return (await this.getSigner())?.getAddress() ?? null
  }
}

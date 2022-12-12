import CoinbaseWalletSDK from '@coinbase/wallet-sdk'
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

export class CoinBase extends WalletHandler {
  public coinbaseWallet!: any

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

    this.coinbaseWallet = new CoinbaseWalletSDK({
      appName: 'CoinBase',
      appLogoUrl: 'https://example.com/logo.png',
      darkMode: true,
    })
    this.nativeProvider = this.coinbaseWallet.makeWeb3Provider(
      getRpc_config(config)(defaultChainId),
      defaultChainId
    )
    if (this.defaultChainId)
      this.nativeProvider = this.coinbaseWallet.makeWeb3Provider(
        getRpc_config(config)(defaultChainId),
        defaultChainId
      )

    this.nativeProvider.once(events.CHANGE_WALLET, this.changeWalletHanlder?.bind(this))
    this.nativeProvider.once(events.CHANGE_CHAIN, this.changeChainHandler?.bind(this))
  }

  async connect(): Promise<boolean> {
    try {
      await this.nativeProvider.enable().catch(async (error: any) => {})
      await this.updateProviderState()

      if (!this.chainId) return false

      if (
        !(this.chainIds as string[]).includes(this.chainId) &&
        !this.config.options?.preventDefaultChangeChain
      )
        await this.switchChain(this.defaultChainId)

      return true
    } catch (error) {
      console.error('Error in connect')
      return false
    }
  }

  async switchChain(chainId: ChainId): Promise<boolean> {
    try {
      const result = await this.nativeProvider.send(methods.SWITCH_CHAIN, [
        { chainId: getChainHex(chainId) },
      ])
      return true
    } catch (error) {
      if (+(error as any).code == 4902) {
        try {
          await this.nativeProvider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: getChainHex(chainId),
                rpcUrls: [getRpc_config(this.config)(chainId)],
                chainName: getChainName(chainId),
                nativeCurrency: {
                  name: getChainDescription(chainId).symbol,
                  decimals: 18,
                  symbol: getChainDescription(chainId).symbol,
                },
                blockExplorerUrls: getChainScanner(chainId)
                  ? [getChainScanner(chainId)]
                  : null,
              },
            ],
          })
          return true
        } catch (error) {
          console.error('Error in switchChain')
          return false
        }
      }
      return true
    }
  }

  async addChain(chainId: string): Promise<boolean> {
    return false
  }

  async disconnect(): Promise<boolean> {
    this.clear()
    try {
      this.coinbaseWallet.disconnect()
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }
}

import { Metamask } from './metamask'
import { Walletconnect } from './walletconnect'
import { CoinBase } from './coinbase'

export const wallets = {
  metamask: Metamask,
  walletconnect: Walletconnect,
  coinbase: CoinBase,
  // native: Native,
  // trustwallet: TrustWallet,
}

export type WalletType = keyof typeof wallets

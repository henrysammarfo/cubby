/** Network config for the live demo. Chipnet is the default. Mainnet is a flip, not a spend. */

export type NetworkId = 'chipnet' | 'mainnet';

export interface Network {
  readonly id: NetworkId;
  readonly prefix: 'bchtest' | 'bitcoincash';
  readonly label: string;
  /** Explorer transaction page, with `{txid}` replaced by the UI-order hash. */
  readonly explorerTx: string;
  readonly explorerAddress: string;
  readonly apiBase: string;
  readonly watchtowerBase: string;
  readonly faucetHint?: string;
  /** Minimum satoshis to put in a vault so a passkey spend can pay a 1 sat per byte fee. */
  readonly recommendedFundSats: bigint;
  /** Conservative fee used when building a 1-input vault spend (unlocking near 10 KB). */
  readonly vaultSpendFeeSats: bigint;
  readonly allowBroadcast: boolean;
}

/** Vault spend transactions are about 9.6 to 10.1 KB. Relay minimum is 1 sat per byte. */
export const VAULT_SPEND_FEE_SATS = 11_000n;
export const RECOMMENDED_FUND_SATS = 20_000n;
export const DUST_SATS = 546n;

export const NETWORKS: Record<NetworkId, Network> = {
  chipnet: {
    id: 'chipnet',
    prefix: 'bchtest',
    label: 'test network',
    explorerTx: 'https://chipnet.bchexplorer.info/tx/{txid}',
    explorerAddress: 'https://chipnet.bchexplorer.info/address/{address}',
    apiBase: 'https://chipnet.bchexplorer.info',
    watchtowerBase: 'https://chipnet.watchtower.cash/api',
    faucetHint: 'https://apecs.dev/bch/faucets',
    recommendedFundSats: RECOMMENDED_FUND_SATS,
    vaultSpendFeeSats: VAULT_SPEND_FEE_SATS,
    allowBroadcast: true,
  },
  mainnet: {
    id: 'mainnet',
    prefix: 'bitcoincash',
    label: 'main network',
    explorerTx: 'https://bchexplorer.info/tx/{txid}',
    explorerAddress: 'https://bchexplorer.info/address/{address}',
    apiBase: 'https://bchexplorer.info',
    watchtowerBase: 'https://watchtower.cash/api',
    recommendedFundSats: RECOMMENDED_FUND_SATS,
    vaultSpendFeeSats: VAULT_SPEND_FEE_SATS,
    allowBroadcast: false,
  },
};

export const DEFAULT_NETWORK: NetworkId = 'chipnet';

export const getNetwork = (id: string | null | undefined): Network => {
  if (id === 'mainnet') return NETWORKS.mainnet;
  return NETWORKS.chipnet;
};

export const explorerTxUrl = (network: Network, txid: string): string =>
  network.explorerTx.replace('{txid}', txid);

export const explorerAddressUrl = (network: Network, address: string): string =>
  network.explorerAddress.replace('{address}', address);

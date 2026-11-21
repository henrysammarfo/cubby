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

/**
 * Single switch for main-network sends. Henry approved this on 21 November 2026
 * (Accra, UTC+0): he will fund the box himself. The 20,000 unit total and the
 * 9,000 unit per-spend cap stay in force, and the 11,000 unit fee guard stays
 * on. Flip this back to false to freeze main-network sends. Follow
 * docs/MAINNET-RUNBOOK.md. Nothing has been spent on the main network yet.
 */
export const MAINNET_SEND_ENABLED = true;
/** What Henry should send to the box, covering the deposit and the spend fee. */
export const MAINNET_APPROVED_FUND_SATS = RECOMMENDED_FUND_SATS;
/** Largest amount a main-network send may pay to the destination (20,000 minus the 11,000 unit fee). */
export const MAINNET_PER_SPEND_CAP_SATS = MAINNET_APPROVED_FUND_SATS - VAULT_SPEND_FEE_SATS;

export const NETWORKS: Record<NetworkId, Network> = {
  chipnet: {
    id: 'chipnet',
    prefix: 'bchtest',
    label: 'test network',
    explorerTx: 'https://chipnet.bchexplorer.info/tx/{txid}',
    explorerAddress: 'https://chipnet.bchexplorer.info/address/{address}',
    apiBase: 'https://chipnet.bchexplorer.info',
    watchtowerBase: 'https://chipnet.watchtower.cash/api',
    faucetHint: 'https://tbch.googol.cash/',
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
    allowBroadcast: MAINNET_SEND_ENABLED,
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

/** Guards a send. On the main network this also enforces the flag and the per-spend cap. */
export const assertSpendAllowed = (
  network: Network,
  amountSats: bigint,
  vaultSats: bigint,
  sendEnabled = MAINNET_SEND_ENABLED,
): void => {
  if (network.id === 'mainnet' && !sendEnabled) {
    throw new Error('Sending on the main network stays off until it is approved.');
  }
  if (amountSats < DUST_SATS) {
    throw new Error(`That send is too small. The smallest amount is ${DUST_SATS} units.`);
  }
  const fee = network.vaultSpendFeeSats;
  if (vaultSats < fee + DUST_SATS) {
    throw new Error(`The box only holds ${vaultSats} units, but a send needs about ${fee + DUST_SATS} (fee ${fee} plus a small leftover). Put at least ${network.recommendedFundSats} units in first.`);
  }
  const maxSend = vaultSats - fee;
  if (amountSats > maxSend) {
    throw new Error(`The box only has ${maxSend} units to send after the ${fee} unit network fee.`);
  }
  if (network.id === 'mainnet') {
    if (amountSats > MAINNET_PER_SPEND_CAP_SATS) {
      throw new Error(`Main network sends are capped at ${MAINNET_PER_SPEND_CAP_SATS} units (the approved 20,000 unit total minus the 11,000 unit fee).`);
    }
    if (amountSats + fee > MAINNET_APPROVED_FUND_SATS) {
      throw new Error('This send would go past the approved 20,000 unit total (deposit plus fees).');
    }
  }
};

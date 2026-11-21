import { describe, expect, it } from 'vitest';
import { sha256, utf8ToBin } from '@bitauth/libauth';
import { p256 } from '@noble/curves/nist.js';
import { broadcastTransaction } from '../src/chain.js';
import { buildVault } from '../src/covenant.js';
import { keyedPasskey } from '../src/bounties/keyed-passkey.js';
import { buildJar } from '../src/bounties/allowance.js';
import { lockingToAddress } from '../src/address.js';
import { buildUnsignedVaultSpend } from '../src/vault-spend.js';
import {
  MAINNET_SEND_ENABLED,
  MAINNET_APPROVED_FUND_SATS,
  MAINNET_PER_SPEND_CAP_SATS,
  NETWORKS,
  VAULT_SPEND_FEE_SATS,
  assertSpendAllowed,
  explorerTxUrl,
  getNetwork,
} from '../src/network.js';
import { encodeLockingBytecodeP2pkh } from '@bitauth/libauth';

const main = NETWORKS.mainnet;
const destLock = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(3));
const utxo = {
  txid: '11'.repeat(32),
  vout: 0,
  satoshis: MAINNET_APPROVED_FUND_SATS,
  lockingBytecode: new Uint8Array(32),
};

describe('Main network readiness (flag defaults OFF, no spend)', () => {
  it('leaves main-network broadcast off by default', () => {
    expect(MAINNET_SEND_ENABLED).toBe(false);
    expect(getNetwork('mainnet').allowBroadcast).toBe(false);
    expect(getNetwork('mainnet').prefix).toBe('bitcoincash');
    expect(NETWORKS.chipnet.allowBroadcast).toBe(true);
  });

  it('uses the approved 20,000 unit total and a 9,000 unit per-spend cap', () => {
    expect(MAINNET_APPROVED_FUND_SATS).toBe(20_000n);
    expect(VAULT_SPEND_FEE_SATS).toBe(11_000n);
    expect(MAINNET_PER_SPEND_CAP_SATS).toBe(9_000n);
  });

  it('refuses a main-network send while the flag is off', () => {
    expect(() => assertSpendAllowed(main, 9_000n, 20_000n, false)).toThrow(/stays off until it is approved/);
    expect(() => assertSpendAllowed(main, 9_000n, 20_000n)).toThrow(/stays off until it is approved/);
  });

  it('broadcastTransaction throws on mainnet before touching the network', async () => {
    await expect(broadcastTransaction(main, '00')).rejects.toThrow(/off until/i);
  });

  it('when the flag is on, caps the destination amount at 9,000 units', () => {
    expect(() => assertSpendAllowed(main, 9_000n, 20_000n, true)).not.toThrow();
    expect(() => assertSpendAllowed(main, 9_001n, 50_000n, true)).toThrow(/capped at 9000 units/);
    expect(() => assertSpendAllowed(main, 9_000n, 19_000n, true)).toThrow(/only has/);
    expect(() => assertSpendAllowed(NETWORKS.chipnet, 9_000n, 20_000n, false)).not.toThrow();
  });

  it('builds a mainnet vault address and a 9,000 unit unsigned spend, without broadcasting', () => {
    const passkey = keyedPasskey(p256.utils.randomSecretKey(), 'cubby-liart-six.vercel.app');
    const vault = buildVault({ publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin('cubby-liart-six.vercel.app')) });
    const address = lockingToAddress(vault.lockingBytecode, main);
    expect(address.startsWith('bitcoincash:p')).toBe(true);
    const funded = { ...utxo, lockingBytecode: vault.lockingBytecode, txid: 'aa'.repeat(32) };
    const tx = buildUnsignedVaultSpend(main, funded, destLock, { amountSats: 9_000n });
    expect(tx.outputs[0]!.valueSatoshis).toBe(9_000n);
    expect(tx.outputs).toHaveLength(1);
  });

  it('builds a mainnet jar address from the same contract', () => {
    const passkey = keyedPasskey(p256.utils.randomSecretKey(), 'cubby-liart-six.vercel.app');
    const vault = buildVault({ publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin('cubby-liart-six.vercel.app')) });
    const child = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(7));
    const jar = buildJar({ ownerVaultLock: vault.lockingBytecode, childLock: child, allowance: 20_000n, periodBlocks: 1n });
    const jarAddr = lockingToAddress(jar.lockingBytecode, main);
    expect(jarAddr.startsWith('bitcoincash:p')).toBe(true);
  });

  it('points explorers at the main-network host', () => {
    const txid = '2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993';
    expect(explorerTxUrl(main, txid)).toBe(`https://bchexplorer.info/tx/${txid}`);
    expect(explorerTxUrl(NETWORKS.chipnet, txid)).toContain('chipnet.bchexplorer.info');
  });
});

/**
 * Builds every action's transaction from pieces XO compiles out of the template (unlocking scripts, output
 * scripts, output values, sequence numbers) and runs them through the libauth BCH 2026 VM.
 */
import { describe, expect, it } from 'vitest';
import { compileCashAssemblyString, parseTemplate } from '@xo-cash/utils';
import { compileLockingBytecodeFromTemplateLockingScriptIdentifier } from '@xo-cash/engine';
import {
  binToHex,
  createVirtualMachineBch2026,
  encodeLockingBytecodeP2pkh,
  hexToBin,
  sha256,
  utf8ToBin,
  type Output,
  type TransactionBch,
} from '@bitauth/libauth';
import { p256 } from '@noble/curves/nist.js';
import { cubbyAllowanceTemplate } from '../source/cubby-allowance.mjs';
import { buildVault, type VaultParams } from '../../../src/covenant.js';
import { keyedPasskey } from '../../../src/bounties/keyed-passkey.js';
import { attachManage, jarUnlocking, buildJar, manageChallenge, unsignedManage } from '../../../src/bounties/allowance.js';

const t = parseTemplate(cubbyAllowanceTemplate as never);
const vm = createVirtualMachineBch2026(true);
const RP = 'xo.cubby.test';
const passkey = keyedPasskey(p256.utils.randomSecretKey(), RP);
const vaultParams: VaultParams = { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP)) };
const vault = buildVault(vaultParams);
const childLock = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(7));

const base = {
  ownerVaultLock: binToHex(vault.lockingBytecode),
  childLock: binToHex(childLock),
  allowance: 20_000n,
  periodBlocks: 3n,
  minerFeeSatoshis: 1000n,
};
type Vars = Record<string, string | bigint>;
// compileCashAssemblyString takes raw bytes for byte variables (the engine's locking compile takes hex strings).
const raw = (v: Vars) =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, t.variables[k]?.type === 'locking_script' ? hexToBin(String(x)) : x]));
const ctx = (variables: Vars) => ({ variables: raw(variables) as never, templateVariables: t.variables, templateScripts: t.scripts });
/** Compile a template script id or `$()` expression the way XO does. */
const bytes = (text: string, v: Vars) =>
  hexToBin(compileCashAssemblyString({ ...ctx(v), cashAssemblyText: text, evaluationDecodeMode: 'hex' }));
const num = (expr: string, v: Vars) => BigInt(compileCashAssemblyString({ ...ctx(v), cashAssemblyText: expr, evaluationDecodeMode: 'bigint' }));
const jarLock = (v: Vars) => compileLockingBytecodeFromTemplateLockingScriptIdentifier(t, 'allowanceJar', v as never);
const outputOf = (id: string, v: Vars): Output => {
  const o = t.outputs[id]!;
  const lockingBytecode = o.lockingScript === 'allowanceJar' ? jarLock(v) : bytes(o.lockingScript, v);
  return { lockingBytecode, valueSatoshis: num(String(o.valueSatoshis), v) };
};
const outpoint = (n: number) => ({ outpointTransactionHash: new Uint8Array(32).fill(n), outpointIndex: 0 });
const verify = (tx: TransactionBch, sourceOutputs: Output[]) => vm.verify({ transaction: tx, sourceOutputs });

describe('XO-built Cubby Allowance transactions pass the BCH 2026 VM', () => {
  const v = { ...base, jarSatoshis: 100_000n };

  it('claimAllowance pays exactly one allowance and returns the rest to the same jar', () => {
    const input = t.inputs.jarClaimInput!;
    const tx: TransactionBch = {
      version: t.transactions.claimTransaction!.version ?? 2,
      locktime: 0,
      inputs: [{ ...outpoint(1), sequenceNumber: Number(num(String(input.sequenceNumber), v)), unlockingBytecode: bytes('jarClaimUnlock', v) }],
      outputs: [outputOf('childPayout', v), outputOf('jarChange', v)],
    };
    expect(tx.outputs.map((o) => o.valueSatoshis)).toEqual([20_000n, 79_000n]);
    expect(binToHex(tx.inputs[0]!.unlockingBytecode)).toBe(binToHex(jarUnlocking(buildJar({ ...base, ownerVaultLock: vault.lockingBytecode, childLock }), 'claim')));
    expect(verify(tx, [{ lockingBytecode: jarLock(v), valueSatoshis: 100_000n }])).toBe(true);
    // The contract's clock: one block short of the period is refused.
    const early = { ...tx, inputs: [{ ...tx.inputs[0]!, sequenceNumber: 2 }] };
    expect(verify(early, [{ lockingBytecode: jarLock(v), valueSatoshis: 100_000n }])).not.toBe(true);
  });

  it('claimLast empties a jar holding less than one allowance', () => {
    const w = { ...base, jarSatoshis: 15_000n };
    const tx: TransactionBch = {
      version: 2,
      locktime: 0,
      inputs: [{ ...outpoint(2), sequenceNumber: 3, unlockingBytecode: bytes('jarClaimUnlock', w) }],
      outputs: [outputOf('childPayoutLast', w)],
    };
    expect(tx.outputs[0]!.valueSatoshis).toBe(14_000n);
    expect(verify(tx, [{ lockingBytecode: jarLock(w), valueSatoshis: 15_000n }])).toBe(true);
  });

  it('manageJar works when the owner passkey approves the co-spent vault, and fails without it', () => {
    const w = { ...base, jarSatoshis: 100_000n, newJarSatoshis: 150_000n, vaultSatoshis: 200_000n, vaultFeeSatoshis: 12_000n };
    const outputs = [outputOf('jarOutputManaged', w), outputOf('vaultChange', w)];
    expect(outputs.map((o) => o.valueSatoshis)).toEqual([150_000n, 138_000n]);
    const vaultUtxo = { txid: binToHex(new Uint8Array(32).fill(3)), vout: 0, satoshis: 200_000n };
    const jarUtxo = { txid: binToHex(new Uint8Array(32).fill(4)), vout: 0, satoshis: 100_000n };
    const unsigned = unsignedManage(vaultUtxo as never, jarUtxo as never, outputs);
    // The vault input is the external commit XO accepts: the passkey signs the intent hash of the final outputs.
    const assertion = passkey.assert(manageChallenge(unsigned));
    const appBuilt = attachManage(vault, vaultParams, { ...base, ownerVaultLock: vault.lockingBytecode, childLock }, unsigned, vaultUtxo as never, jarUtxo as never, assertion);
    const tx: TransactionBch = {
      ...appBuilt.tx,
      inputs: [appBuilt.tx.inputs[0]!, { ...appBuilt.tx.inputs[1]!, unlockingBytecode: bytes('jarManageUnlock', w) }],
    };
    const sources = [
      { lockingBytecode: vault.lockingBytecode, valueSatoshis: 200_000n },
      { lockingBytecode: jarLock(w), valueSatoshis: 100_000n },
    ];
    expect(verify(tx, sources)).toBe(true);
    const alone: TransactionBch = { ...tx, inputs: [{ ...outpoint(5), sequenceNumber: 0, unlockingBytecode: bytes('jarManageUnlock', w) }] };
    expect(verify(alone, [sources[1]!])).not.toBe(true);
  });
});

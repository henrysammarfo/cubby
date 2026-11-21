/**
 * Size and op-cost distribution over many fresh signatures.
 * Usage: npx tsx scripts/report.ts [runs]
 */
import { encodeTransactionBch, hexToBin } from '@bitauth/libauth';
import { makeFixture, signedTx, evaluate } from '../test/fixtures.js';

const runs = Number(process.argv[2] ?? 200);
// --backup measures a box with the "never stuck" backup path (docs/BACKUP-RECOVERY.md).
const withBackup = process.argv.includes('--backup');
const f = await makeFixture(withBackup ? { lockingBytecode: hexToBin(`aa20${'33'.repeat(32)}87`), delayBlocks: 52_560 } : undefined);
console.log(withBackup ? 'mode: backup on (worst case: 1 year delay, P2SH32 backup)' : 'mode: no backup');
const variants = {
  plain: {},
  chromeExtra: { extra: ',"other_keys_can_be_added_here":"do not compare clientDataJSON against a template. See https://goo.gl/yabPex"' },
} as const;
console.log(`redeem script: ${f.vault.redeemBytecode.length} B; locking: ${f.vault.lockingBytecode.length} B (P2SH32)`);
for (const [name, opts] of Object.entries(variants)) {
  const sizes: number[] = [];
  const ratios: number[] = [];
  const txSizes: number[] = [];
  let over = 0;
  let failed = 0;
  for (let i = 0; i < runs; i++) {
    const tx = await signedTx(f, f.tx, opts);
    const u = tx.inputs[0]!.unlockingBytecode.length;
    sizes.push(u);
    txSizes.push(encodeTransactionBch(tx).length);
    if (u > 10_000) {
      over++;
      continue;
    }
    const st = evaluate(tx, f.sourceOutputs);
    if (st.error !== undefined || st.stack.length !== 1) failed++;
    ratios.push(st.metrics.operationCost / st.metrics.maximumOperationCost);
  }
  const stat = (a: number[]) => `min ${Math.min(...a).toFixed(3)} mean ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)} max ${Math.max(...a).toFixed(3)}`;
  console.log(`${name}: ${runs} runs; unlocking B ${stat(sizes)}; tx B ${stat(txSizes)}; op cost/limit ${stat(ratios)}; over 10,000 B: ${over}; VM failures: ${failed}`);
}

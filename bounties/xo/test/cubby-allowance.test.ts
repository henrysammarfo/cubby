/**
 * Offline checks of the XO template with the real XO packages (engine 0.1.1-next):
 * schema validation, and the locking bytecode XO compiles equals the address the Cubby app and the SolidCash SDK use.
 */
import { describe, expect, it } from 'vitest';
import { parseTemplate, generateTemplateIdentifier } from '@xo-cash/utils';
import { compileLockingBytecodeFromTemplateLockingScriptIdentifier } from '@xo-cash/engine';
import { binToHex, encodeLockingBytecodeP2pkh } from '@bitauth/libauth';
import { cubbyAllowanceTemplate } from '../source/cubby-allowance.mjs';
import { ALLOWANCE_BYTECODE_HEX, ALLOWANCE_SELECTORS } from '../source/allowance-bytecode.mjs';
import * as app from '../../../src/bounties/allowance-artifact.js';
import { buildJar } from '../../../src/bounties/allowance.js';

const ownerVaultLock = Uint8Array.from([0xaa, 0x20, ...new Array(32).fill(0x11), 0x87]);
const childLock = encodeLockingBytecodeP2pkh(new Uint8Array(20).fill(7));

describe('Cubby Allowance XO template', () => {
  it('passes XO template validation', async () => {
    const parsed = parseTemplate(cubbyAllowanceTemplate as never);
    expect(parsed.name).toBe('Cubby Allowance');
    expect(await generateTemplateIdentifier(parsed)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries the same compiled SolidCash bytecode as the app', () => {
    expect(ALLOWANCE_BYTECODE_HEX).toBe(app.ALLOWANCE_BYTECODE_HEX);
    expect(ALLOWANCE_SELECTORS).toEqual(app.ALLOWANCE_SELECTORS);
  });

  it('XO compiles the jar to the same P2SH32 address as the app and SolidCash SDK', () => {
    const parsed = parseTemplate(cubbyAllowanceTemplate as never);
    for (const [allowance, period] of [[20_000n, 1n], [50_000n, 1008n], [1_000n, 65_535n]] as const) {
      const xo = compileLockingBytecodeFromTemplateLockingScriptIdentifier(parsed, 'allowanceJar', {
        // XO variables carry bytes as hex strings (as in an invitation).
        ownerVaultLock: binToHex(ownerVaultLock),
        childLock: binToHex(childLock),
        allowance,
        periodBlocks: period,
      } as never);
      const mine = buildJar({ ownerVaultLock, childLock, allowance, periodBlocks: period });
      expect(binToHex(xo)).toBe(binToHex(mine.lockingBytecode));
    }
  });
});

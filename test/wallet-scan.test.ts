import { describe, expect, it } from 'vitest';
import { scanAddressBatches } from '../src/wallet-scan.js';

const deriveFrom = (max: number) => (index: number) => (index <= max ? index : undefined);
const inspect =
  (seen: number[], hasHistory: (index: number) => boolean) =>
  async (batch: number[]): Promise<boolean[]> => {
    seen.push(...batch);
    return batch.map(hasHistory);
  };

describe('address scan in batches of 20', () => {
  it('stops after the first batch when none of the first 20 have history', async () => {
    const seen: number[] = [];
    const used = await scanAddressBatches(deriveFrom(100), inspect(seen, (index) => index >= 25));
    expect(used).toEqual([]);
    expect(seen).toEqual([...Array(20).keys()]);
  });

  it('keeps scanning later batches while a batch has history', async () => {
    const seen: number[] = [];
    const used = await scanAddressBatches(deriveFrom(100), inspect(seen, (index) => index === 18 || index === 25));
    expect(used).toEqual([18, 25]);
    expect(seen).toEqual([...Array(60).keys()]);
  });

  it('stops when a later batch has no history', async () => {
    const seen: number[] = [];
    const used = await scanAddressBatches(deriveFrom(100), inspect(seen, (index) => index < 5));
    expect(used).toEqual([0, 1, 2, 3, 4]);
    expect(seen).toEqual([...Array(40).keys()]);
  });

  it('handles a wallet that only shares the first key', async () => {
    const used = await scanAddressBatches(
      (index) => (index === 0 ? 'addr0' : undefined),
      async (batch) => batch.map(() => true),
    );
    expect(used).toEqual(['addr0']);
  });
});

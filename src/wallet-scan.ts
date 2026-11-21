/** Scan HD addresses in batches of 20 until a batch has no history (Finney's gap fix). */
export const ADDRESS_SCAN_BATCH = 20;
export const ADDRESS_SCAN_MAX = 200;

export const scanAddressBatches = async <T>(
  derive: (index: number) => T | undefined,
  inspectBatch: (batch: T[]) => Promise<boolean[]>,
  batchSize = ADDRESS_SCAN_BATCH,
  maxIndex = ADDRESS_SCAN_MAX,
): Promise<T[]> => {
  const used: T[] = [];
  const size = Math.max(1, batchSize);
  for (let start = 0; start < maxIndex; start += size) {
    const batch: T[] = [];
    for (let i = 0; i < size; i += 1) {
      const item = derive(start + i);
      if (item === undefined) break;
      batch.push(item);
    }
    if (batch.length === 0) break;
    const flags = await inspectBatch(batch);
    if (flags.length !== batch.length) {
      throw new Error('Address scan returned a result for the wrong number of addresses.');
    }
    let any = false;
    for (let i = 0; i < batch.length; i += 1) {
      if (flags[i]) {
        used.push(batch[i] as T);
        any = true;
      }
    }
    if (!any) break;
    if (batch.length < size) break;
  }
  return used;
};

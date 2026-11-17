/** Off-chain mirror of the covenant's introspection intent hash. */
import { flattenBinArray, sha256, type TransactionBch } from '@bitauth/libauth';

const le = (value: bigint, bytes: number): Uint8Array => {
  if (value < 0n || value >= 1n << BigInt(bytes * 8 - 1)) throw new Error(`value ${value} does not fit ${bytes} signed bytes`);
  const out = new Uint8Array(bytes);
  let v = value;
  for (let i = 0; i < bytes; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
};

const lenPrefixed = (data: Uint8Array, bytes: number): Uint8Array => flattenBinArray([le(BigInt(data.length), bytes), data]);

export const intentPreimage = (tx: TransactionBch, inputIndex: number): Uint8Array => {
  const input = tx.inputs[inputIndex];
  if (input === undefined) throw new Error('no such input');
  const parts: Uint8Array[] = [
    input.outpointTransactionHash.slice().reverse(),
    le(BigInt(input.outpointIndex), 4),
    le(BigInt(tx.version), 4),
    le(BigInt(tx.locktime), 4),
    le(BigInt(tx.outputs.length), 2),
  ];
  for (const out of tx.outputs) {
    const t = out.token;
    const capability = t?.nft?.capability === 'minting' ? [2] : t?.nft?.capability === 'mutable' ? [1] : [];
    const category = t === undefined ? new Uint8Array() : flattenBinArray([t.category.slice().reverse(), Uint8Array.from(capability)]);
    const commitment = t?.nft?.commitment ?? new Uint8Array();
    parts.push(
      le(out.valueSatoshis, 8),
      lenPrefixed(category, 1),
      lenPrefixed(commitment, 2),
      le(t?.amount ?? 0n, 8),
      lenPrefixed(out.lockingBytecode, 2),
    );
  }
  return flattenBinArray(parts);
};

export const intentHash = (tx: TransactionBch, inputIndex: number): Uint8Array => sha256.hash(intentPreimage(tx, inputIndex));

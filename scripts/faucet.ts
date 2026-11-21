/** Apecs chipnet faucet (proof of work, no account). Do not bypass rate limits. */
import { createHash } from 'node:crypto';

const BASE = 'https://apecs.dev/v1/faucet/bch';

export interface FaucetChallenge {
  readonly challenge: string;
  readonly difficulty: number;
  readonly drip_sat: string;
  readonly expires_at: number;
}

const leadingZeroBits = (digest: Buffer): number => {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
};

export const solveChallenge = (challengeHex: string, difficulty: number): number => {
  const challenge = Buffer.from(challengeHex, 'hex');
  const nonceBuf = Buffer.alloc(8);
  for (let nonce = 0; nonce < Number.MAX_SAFE_INTEGER; nonce++) {
    nonceBuf.writeUInt32LE(nonce >>> 0, 0);
    nonceBuf.writeUInt32LE(Math.floor(nonce / 0x1_0000_0000), 4);
    const digest = createHash('sha256').update(challenge).update(nonceBuf).digest();
    if (leadingZeroBits(digest) >= difficulty) return nonce;
  }
  throw new Error('Faucet puzzle was not solved.');
};

export const claimFaucet = async (address: string): Promise<{ txid: string; amountSat: bigint }> => {
  const challengeRes = await fetch(`${BASE}/challenge`);
  const challengeJson = (await challengeRes.json()) as FaucetChallenge & { ok?: boolean; error?: string };
  if (!challengeRes.ok || challengeJson.ok === false) {
    throw new Error(`Faucet challenge failed: ${JSON.stringify(challengeJson).slice(0, 300)}`);
  }
  const nonce = solveChallenge(challengeJson.challenge, challengeJson.difficulty);
  const claimRes = await fetch(`${BASE}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: challengeJson.challenge, nonce, address }),
  });
  const claimJson = (await claimRes.json()) as {
    ok?: boolean;
    txid?: string;
    amount_sat?: string;
    code?: string;
    error?: string;
  };
  if (!claimRes.ok || !claimJson.ok || !claimJson.txid) {
    throw new Error(`Faucet claim failed (${claimRes.status}): ${JSON.stringify(claimJson).slice(0, 400)}`);
  }
  return { txid: claimJson.txid, amountSat: BigInt(claimJson.amount_sat ?? challengeJson.drip_sat) };
};

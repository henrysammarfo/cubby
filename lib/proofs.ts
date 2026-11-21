import allowanceJson from '@/docs/proofs/allowance-chipnet.json';
import identityJson from '@/docs/proofs/identity-chipnet.json';

export const ALLOWANCE_PROOF = allowanceJson as {
  network: string;
  vaultAddress: string;
  jarAddress: string;
  childAddress: string;
  params: { allowance: string; periodBlocks: string };
  fund: string;
  manage: string;
  claim: string;
  manageUnlockingBytes: number;
};

export const IDENTITY_PROOF = identityJson as {
  network: string;
  anchor: string;
  npub: string;
  vaultAddress: string;
  relay: string;
  discovered: { vaultAddress: string; anchor: string };
  login: { factors: string[] };
  pay: string;
};

export const periodLabel = (blocks: bigint | string): string => {
  const n = BigInt(blocks);
  if (n === 144n) return 'Every day';
  if (n === 1008n) return 'Every week';
  if (n === 1n) return 'Every block (demo wait)';
  return `Every ${n.toString()} blocks`;
};

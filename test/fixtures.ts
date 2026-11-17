import {
  createVirtualMachineBch2026,
  hexToBin,
  sha256,
  utf8ToBin,
  type Output,
  type TransactionBch,
} from '@bitauth/libauth';
import { buildVault, type Vault, type VaultParams } from '../src/covenant.js';
import { intentHash } from '../src/intent.js';
import { createSoftPasskey, type AssertOptions, type SoftPasskey } from '../src/softAuthenticator.js';
import { unlockFromAssertion } from '../src/unlock.js';

export const RP_ID = 'cubby.cash';
export const vm = createVirtualMachineBch2026(true);

export interface Fixture {
  readonly passkey: SoftPasskey;
  readonly params: VaultParams;
  readonly vault: Vault;
  readonly sourceOutputs: Output[];
  readonly tx: TransactionBch;
}

const TOKEN_CATEGORY = hexToBin('2469acc5afa4b10cb5b5c04afb89c3a3ffd61c5da9c01e26d00951cae2a02544');

export const makeFixture = async (): Promise<Fixture> => {
  const passkey = await createSoftPasskey(RP_ID);
  const params: VaultParams = { publicKey: passkey.publicKey, rpIdHash: sha256.hash(utf8ToBin(RP_ID)) };
  const vault = buildVault(params);
  const sourceOutputs: Output[] = [
    {
      lockingBytecode: vault.lockingBytecode,
      valueSatoshis: 200_000n,
      token: { category: TOKEN_CATEGORY, amount: 5_000n, nft: { capability: 'mutable', commitment: hexToBin('c0ffee') } },
    },
  ];
  const tx: TransactionBch = {
    version: 2,
    locktime: 0,
    inputs: [{ outpointTransactionHash: hexToBin('ab'.repeat(32)), outpointIndex: 1, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
    outputs: [
      // payment to a P2PKH address
      { lockingBytecode: hexToBin(`76a914${'22'.repeat(20)}88ac`), valueSatoshis: 50_000n },
      // tokens back to the vault (fungible amount plus the mutable NFT)
      {
        lockingBytecode: vault.lockingBytecode,
        valueSatoshis: 1_000n,
        token: { category: TOKEN_CATEGORY, amount: 5_000n, nft: { capability: 'mutable', commitment: hexToBin('c0ffee') } },
      },
      // BCH change back to the vault
      { lockingBytecode: vault.lockingBytecode, valueSatoshis: 120_000n },
    ],
  };
  return { passkey, params, vault, sourceOutputs, tx };
};

/** Sign the intent of `tx` input 0 and return a copy of tx with the unlocking bytecode set. */
export const signedTx = async (f: Fixture, tx: TransactionBch = f.tx, options: AssertOptions = {}, padBytes = 0): Promise<TransactionBch> => {
  const assertion = await f.passkey.assert(intentHash(tx, 0), options);
  const unlocking = unlockFromAssertion(f.vault, f.params, tx, 0, assertion, padBytes);
  return withUnlocking(tx, 0, unlocking);
};

export const withUnlocking = (tx: TransactionBch, index: number, unlockingBytecode: Uint8Array): TransactionBch => ({
  ...tx,
  inputs: tx.inputs.map((input, i) => (i === index ? { ...input, unlockingBytecode } : input)),
});

export const evaluate = (tx: TransactionBch, sourceOutputs: Output[], inputIndex = 0) =>
  vm.evaluate({ inputIndex, sourceOutputs, transaction: tx });

/** Short status line: "pass cost/limit" or "fail <error>". */
export const status = (tx: TransactionBch, sourceOutputs: Output[], inputIndex = 0): string => {
  const st = evaluate(tx, sourceOutputs, inputIndex);
  if (st.error !== undefined) return `fail ${st.error}`;
  if (st.stack.length !== 1) return `fail stack depth ${st.stack.length}`;
  return `pass ${st.metrics.operationCost}/${st.metrics.maximumOperationCost}`;
};

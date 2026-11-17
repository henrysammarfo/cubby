/**
 * Real-device passkey check (iPhone, Android, Windows Hello) against the VM.
 *
 *   npx tsx scripts/device-check.ts --challenge      # print the fixed test challenge (hex)
 *   npx tsx scripts/device-check.ts result.json      # verify a JSON exported by harness/passkey-device-check.html
 *
 * The test transaction is fixed and does not depend on the device key, so the
 * challenge is the same for every device. Nothing is broadcast.
 */
import { readFileSync } from 'node:fs';
import { binToHex, createVirtualMachineBch2026, hexToBin, type TransactionBch } from '@bitauth/libauth';
import { buildVault } from '../src/covenant.js';
import { intentHash } from '../src/intent.js';
import { unlockFromAssertion } from '../src/unlock.js';
import { decodeUncompressed, fromBase64url } from '../src/webauthn.js';

export const DEVICE_TEST_TX: TransactionBch = {
  version: 2,
  locktime: 0,
  inputs: [{ outpointTransactionHash: hexToBin('c0'.repeat(32)), outpointIndex: 0, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
  outputs: [{ lockingBytecode: hexToBin(`76a914${'42'.repeat(20)}88ac`), valueSatoshis: 10_000n }],
};

interface DeviceResult {
  readonly label?: string;
  readonly publicKeySpki: string;
  readonly authenticatorData: string;
  readonly clientDataJSON: string;
  readonly signature: string;
}

const arg = process.argv[2];
if (arg === undefined || arg === '--challenge') {
  console.log(binToHex(intentHash(DEVICE_TEST_TX, 0)));
} else {
  const json = JSON.parse(readFileSync(arg, 'utf8')) as DeviceResult;
  const assertion = {
    authenticatorData: fromBase64url(json.authenticatorData),
    clientDataJSON: fromBase64url(json.clientDataJSON),
    signature: fromBase64url(json.signature),
  };
  const params = { publicKey: decodeUncompressed(fromBase64url(json.publicKeySpki)), rpIdHash: assertion.authenticatorData.subarray(0, 32) };
  const vault = buildVault(params);
  const sourceOutputs = [{ lockingBytecode: vault.lockingBytecode, valueSatoshis: 20_000n }];
  const unlocking = unlockFromAssertion(vault, params, DEVICE_TEST_TX, 0, assertion);
  const vm = createVirtualMachineBch2026(true);
  const run = (label: string, tx: TransactionBch) => {
    const st = vm.evaluate({ inputIndex: 0, sourceOutputs, transaction: tx });
    console.log(`${label}: ${st.error === undefined && st.stack.length === 1 ? `PASS op cost ${st.metrics.operationCost}/${st.metrics.maximumOperationCost}` : `FAIL ${st.error ?? 'stack'}`}`);
  };
  const signed: TransactionBch = { ...DEVICE_TEST_TX, inputs: [{ ...DEVICE_TEST_TX.inputs[0]!, unlockingBytecode: unlocking }] };
  console.log(`device: ${json.label ?? 'unlabelled'}; clientDataJSON: ${Buffer.from(assertion.clientDataJSON).toString()}`);
  console.log(`flags 0x${(assertion.authenticatorData[32] ?? 0).toString(16)}; unlocking ${unlocking.length} B`);
  run('valid spend (expect PASS)', signed);
  const out = signed.outputs[0]!;
  run('output value +1 sat (expect FAIL)', { ...signed, outputs: [{ ...out, valueSatoshis: out.valueSatoshis + 1n }] });
  run('other outpoint (expect FAIL)', { ...signed, inputs: [{ ...signed.inputs[0]!, outpointIndex: 1 }] });
}

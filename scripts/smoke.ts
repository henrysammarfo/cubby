import { createVirtualMachineBch2026, hexToBin, sha256, utf8ToBin, type TransactionBch, type Output } from '@bitauth/libauth';
import { buildVault } from '../src/covenant.js';
import { intentHash } from '../src/intent.js';
import { createSoftPasskey } from '../src/softAuthenticator.js';
import { unlockFromAssertion } from '../src/unlock.js';

const pk = await createSoftPasskey('cubby.cash');
const params = { publicKey: pk.publicKey, rpIdHash: sha256.hash(utf8ToBin('cubby.cash')) };
const vault = buildVault(params);
console.log('redeem bytes', vault.redeemBytecode.length);
const source: Output = { lockingBytecode: vault.lockingBytecode, valueSatoshis: 100_000n };
const tx: TransactionBch = {
  version: 2, locktime: 0,
  inputs: [{ outpointTransactionHash: hexToBin('11'.repeat(32)), outpointIndex: 1, sequenceNumber: 0, unlockingBytecode: new Uint8Array() }],
  outputs: [{ lockingBytecode: hexToBin('76a914' + '22'.repeat(20) + '88ac'), valueSatoshis: 80_000n }],
};
const a = await pk.assert(intentHash(tx, 0));
const unlocking = unlockFromAssertion(vault, params, tx, 0, a);
tx.inputs[0] = { ...tx.inputs[0]!, unlockingBytecode: unlocking };
console.log('unlocking bytes', unlocking.length);
const vm = createVirtualMachineBch2026(true);
const st = vm.evaluate({ inputIndex: 0, sourceOutputs: [source], transaction: tx });
console.log('error', st.error, 'cost', st.metrics.operationCost, 'max', st.metrics.maximumOperationCost, 'stack', st.stack.length);
console.log('verify', vm.verify({ sourceOutputs: [source], transaction: tx }));

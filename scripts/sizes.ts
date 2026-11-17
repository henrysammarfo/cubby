import { sha256, utf8ToBin, disassembleBytecodeBch } from '@bitauth/libauth';
import { buildRedeemAsm, compileAsm } from '../src/covenant.js';
import { G } from '../src/p256.js';
const asm = buildRedeemAsm({ publicKey: G, rpIdHash: sha256.hash(utf8ToBin('x')) });
const lines = asm.split('\n');
let total=0;
for (const l of lines) { const b = compileAsm(l).length; total+=b; if (b>12) console.log(b, l.slice(0,110)); }
console.log('total', total);

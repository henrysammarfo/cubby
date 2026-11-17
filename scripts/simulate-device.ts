/** Writes a harness-format JSON from the software passkey, to dry-run device-check.ts. */
import { writeFileSync } from 'node:fs';
import { hexToBin } from '@bitauth/libauth';
import { createSoftPasskey } from '../src/softAuthenticator.js';
import { base64url } from '../src/webauthn.js';

const [challengeHex, outFile = '/tmp/cubby-soft-device.json'] = process.argv.slice(2);
if (challengeHex === undefined) throw new Error('usage: simulate-device.ts <challengeHex> [out.json]');
const pk = await createSoftPasskey('cubby.cash');
const a = await pk.assert(hexToBin(challengeHex));
const hex64 = (v: bigint) => v.toString(16).padStart(64, '0');
const raw = hexToBin(`04${hex64(pk.publicKey.x)}${hex64(pk.publicKey.y)}`);
writeFileSync(outFile, JSON.stringify({ label: 'software passkey', publicKeySpki: base64url(raw), authenticatorData: base64url(a.authenticatorData), clientDataJSON: base64url(a.clientDataJSON), signature: base64url(a.signature) }, null, 2));
console.log(`wrote ${outFile}`);

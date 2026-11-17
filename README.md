# Cubby: S1 signing gate

**Status: private, backend only, work in progress (BCH BLAZE 2026).** Nothing here is deployed or public.

Cubby lets a phone passkey (Face ID, fingerprint, Windows Hello) authorize a Bitcoin Cash spend **checked by the chain itself**. This repository holds the S1 signing gate: a CashVM covenant that verifies a WebAuthn P-256 assertion whose challenge is an *intent hash* of the spending transaction.

## What the covenant checks (one input, no helper UTXOs)

1. **Intent hash by introspection.** The script rebuilds
   `sha256(outpoint txid | outpoint index | version | locktime | output count | for each output: value, token category + capability, NFT commitment, token amount, locking bytecode)`
   from the transaction it is running in. No sighash rebuild.
2. **WebAuthn wrapper.** The challenge is the base64url form of that hash. The script rebuilds
   `clientDataJSON = {"type":"webauthn.get","challenge":"<43 chars>` + the spender's suffix (which must close the string),
   rebuilds `authenticatorData` from the vault's fixed `rpIdHash` plus the spender's flags and counter,
   requires the UP and UV flags, and computes `e = sha256(authenticatorData | sha256(clientDataJSON))`.
3. **P-256 ECDSA verify in script**, using half-size scalars (Antipa et al., SAC 2005) and affine point steps whose slopes are supplied as hints and checked with one multiplication each. One 128-bit joint double-and-add loop replaces two 256-bit scalar multiplications.
4. **Clean stack**: exactly one item (true) is left. **Unlocking padding** (zero bytes only) is supported to raise the operation-cost budget if ever needed.

Because the outputs and the spent outpoint are inside the signed challenge, changing any output byte or replaying the signature on another outpoint fails.

## Numbers (libauth 3.1.0-next.8, BCH 2026 VM, standard mode)

| | value |
|---|---|
| Redeem script | 1,077 bytes (P2SH32 locking bytecode: 35 bytes) |
| Unlocking bytecode | 9,333 to 9,721 bytes, mean 9,556 (150 signatures); standard limit 10,000 |
| Same, with Chrome's extra `other_keys_can_be_added_here` member | 9,444 to 9,860 bytes, mean 9,652 |
| Operation cost | about 81% of the per-input budget `(41 + unlocking length) x 800`, no padding needed |
| Full 1-in 1-out transaction | about 9.6 to 9.9 KB |

Run `npm run size` for a fresh distribution.

## Use

```bash
npm install
npm test              # 20 tests: acceptance, negatives, units
npm run typecheck     # TypeScript strict
npx tsx scripts/report.ts 200          # size and op-cost distribution
npx tsx scripts/device-check.ts --challenge
npx tsx scripts/device-check.ts result.json   # verify a real device assertion in the VM
```

`harness/passkey-device-check.html` is a self-contained page (no network, no third-party code) for collecting a real device assertion. It is **not deployed**; it needs an HTTPS origin (or localhost on a laptop) that Henry approves, because a passkey is bound to its domain.

## Where to read

- `src/covenant.ts`: the covenant (CashAssembly generated with a small named-stack helper, `src/asm.ts`)
- `src/hints.ts`: off-chain prover for the scalars and slope hints
- `src/intent.ts`: off-chain mirror of the intent hash
- `src/unlock.ts`, `src/webauthn.ts`: assertion to unlocking bytecode
- `test/gate.test.ts`: acceptance tests from plan section 6.1 plus negative cases
- `DOCS_NOTES.md`: every protocol fact used, with source and date

## Limitations

- **Size margin.** The unlocking bytecode sits about 140 to 670 bytes under the 10,000-byte standard limit. If a signature ever lands over, `unlockFromAssertion` throws `UnlockingTooLargeError` and the app should ask for one more approval (a new signature changes the size). Not seen in 450 test signatures.
- **Empty immutable NFTs are invisible to introspection.** `OP_OUTPUTTOKEN*` cannot tell "fungible tokens only" from "fungible tokens plus an immutable NFT with an empty commitment". Creating one needs a minting NFT of that category in the transaction, and removing one is a burn; Cubby vaults do not hold such NFTs. Documented by a test.
- **Other inputs are not signed.** Like `SIGHASH_ANYONECANPAY | ALL`: anyone can add inputs (which can only add fee); each vault input needs its own signature over its own outpoint.
- **Transaction id malleability.** A third party can re-encode the hints or padding of an unconfirmed spend (same effect, new txid). Do not build unconfirmed chains on top of a vault spend until it confirms.
- **Locktime** must be below 2^31 (fits a 4-byte script number), true for all block heights and for timestamps until 2038.
- **Real devices** (iPhone, Android, Windows) are not tested yet; the VM tests use a software P-256 authenticator that produces byte-exact WebAuthn assertions.

## Credit

Sahid Miller (SeedlessBCH, signatures.cash, @SeedlessCash) showed the first Pay-to-P-256 transaction on BCH chipnet on 21 Jan 2026 and first pitched passkey-signed BCH. Cubby builds on that idea. His repository has no licence, so **no code was copied**: every line here is written fresh, and the verifier uses a different method (single input, hint-checked affine arithmetic with half-size scalars, intent hash by introspection).

## Licence

Not yet chosen. Private repository.

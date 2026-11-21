# Cubby

**Status: private work in progress for BCH BLAZE 2026.** The signing gate is tested (20/20 unit tests). The live demo app is built. The repository is still private. No mainnet coins have been spent. An automated chipnet deposit and passkey spend is waiting on a working faucet drip (see Limitations).

Cubby is a new project. The repository was created on 17 November 2026. There is no earlier demo and no earlier repository.

Cubby lets a phone lock (face, fingerprint, or Windows Hello) approve a Bitcoin Cash spend that **the chain itself checks**. The S1 signing gate is a CashVM covenant that verifies a WebAuthn P-256 assertion whose challenge is an intent hash of the spending transaction.

## Banner (required for BLAZE)

- Widget Factory template: https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit?usp=sharing
- Repository: https://github.com/henrysammarfo/cubby
- Community Choice (EMBER 2026) CashTokens address: `bitcoincash:zpuu5t2lxyhykjnfcl8mtxa792pfy88urqv7wrwrmj`

Prize money is paid to the CashTokens address shown in the demo banner. That address was generated into a local gitignored key file. Henry must move the key to a wallet he controls, or replace the banner with an address he already owns, before the repo is public.

## Try the live demo

The deploy URL will be added here as soon as the free Vercel origin is live. Open it on a phone or laptop with a screen lock.

1. Stay on the test network (the default). Those coins have no value.
2. Optionally connect a Bitcoin Cash wallet with WizardConnect. Set the wallet to the test network too.
3. Create your phone lock. It is tied to this website address.
4. Send at least 20 000 test units to the box address (or paste the payment id after you send). The on-chain check is a large transaction, about 10 KB, and the fee is 1 unit per byte, so a smaller deposit cannot cover the send.
5. Send the coins back with your face or fingerprint.
6. Open the payment on the explorer.

Main network sending stays off until Henry approves the funding address and the exact number of satoshis (20 000 satoshis, which is 0.0002 BCH, is the planned amount).

## What the covenant checks (one input, no helper outputs)

1. **Intent hash by introspection.** The script rebuilds
   `sha256(outpoint txid | outpoint index | version | locktime | output count | for each output: value, token category + capability, NFT commitment, token amount, locking bytecode)`
   from the transaction it is running in. No sighash rebuild.
2. **WebAuthn wrapper.** The challenge is the base64url form of that hash. The script rebuilds
   `clientDataJSON = {"type":"webauthn.get","challenge":"<43 chars>` + the spender's suffix (which must close the string),
   rebuilds `authenticatorData` from the vault's fixed `rpIdHash` plus the spender's flags and counter,
   requires the UP and UV flags, and computes `e = sha256(authenticatorData | sha256(clientDataJSON))`.
3. **P-256 ECDSA verify in script**, using half-size scalars (Antipa et al., SAC 2005) and affine point steps whose slopes are supplied as hints and checked with one multiplication each. One 128-bit joint double-and-add loop replaces two 256-bit scalar multiplications.
4. **Clean stack**: exactly one item (true) is left. Unlocking padding (zero bytes only) is supported to raise the operation-cost budget if ever needed.

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

## Develop

```bash
npm install
npm test              # 20 tests: acceptance, negatives, units
npm run typecheck
npm run dev           # local demo at http://localhost:5173
npm run build:web
npx tsx scripts/chipnet-e2e.ts   # faucet, fund, software passkey spend on chipnet
```

`harness/passkey-device-check.html` is still there for collecting a raw device assertion.

## Where to read

- `web/`: the live demo (minimal, token based styles, no logo)
- `src/covenant.ts`: the covenant (CashAssembly generated with a small named-stack helper, `src/asm.ts`)
- `src/vault-spend.ts`, `src/p2pkh-send.ts`, `src/chain.ts`: payment building and explorer access
- `test/gate.test.ts`: acceptance tests from plan section 6.1 plus negative cases
- `DOCS_NOTES.md`: every protocol fact used, with source and date

## Limitations

- **Size margin.** The unlocking bytecode sits about 140 to 670 bytes under the 10,000-byte standard limit. If a signature ever lands over, `unlockFromAssertion` throws `UnlockingTooLargeError` and the app should ask for one more approval (a new signature changes the size). Not seen in 450 test signatures.
- **Empty immutable NFTs are invisible to introspection.** `OP_OUTPUTTOKEN*` cannot tell "fungible tokens only" from "fungible tokens plus an immutable NFT with an empty commitment". Creating one needs a minting NFT of that category in the transaction, and removing one is a burn; Cubby vaults do not hold such NFTs. Documented by a test.
- **Other inputs are not signed.** Like `SIGHASH_ANYONECANPAY | ALL`: anyone can add inputs (which can only add fee); each vault input needs its own signature over its own outpoint.
- **Transaction id malleability.** A third party can re-encode the hints or padding of an unconfirmed spend (same effect, new txid). Do not build unconfirmed chains on top of a vault spend until it confirms.
- **Locktime** must be below 2^31 (fits a 4-byte script number), true for all block heights and for timestamps until 2038.
- **Real devices** (iPhone, Android, Windows) still need a check on the live HTTPS origin; the automated chipnet run uses a software P-256 authenticator that produces byte-exact WebAuthn assertions.
- **The box is bound to one website address** (`rpIdHash` is fixed in the redeem script).
- **Chipnet faucet access from this build environment is currently broken.** The Ninja faucet returns a "submitted" payment id that explorers and Watchtower never see. The Apecs faucet accepts the proof of work and then fails with a Fulcrum websocket 502. The Googol faucet works on chipnet but requires a captcha, which is not automated. The demo can be funded by sending at least 20 000 chipnet units to the vault address shown in the app, after which a passkey spend can be broadcast.

## Credit

Sahid Miller (SeedlessBCH, signatures.cash, @SeedlessCash) showed the first Pay-to-P-256 transaction on BCH chipnet on 21 Jan 2026 and first pitched passkey-signed BCH. Cubby builds on that idea. His repository has no licence, so **no code was copied**: every line here is written fresh, and the verifier uses a different method (single input, hint-checked affine arithmetic with half-size scalars, intent hash by introspection).

## Licence

Not yet chosen. Private repository.

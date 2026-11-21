# Cubby

**Status: private work in progress for BCH BLAZE 2026.** The signing gate is tested (34 unit tests). The live demo is deployed. A real chipnet vault deposit and passkey spend are on the test network (see links below). The repository is still private. No mainnet coins have been spent.

Cubby was built fresh during BLAZE. The first commit is 17 November 2026 ([18c652e](https://github.com/henrysammarfo/cubby/commit/18c652e)). There is no earlier demo and no earlier repository, so judges do not need a 14 November starting-state demo link.

Cubby lets a phone lock (face, fingerprint, or Windows Hello) approve a Bitcoin Cash spend that **the chain itself checks**. The S1 signing gate is a CashVM covenant that verifies a WebAuthn P-256 assertion whose challenge is an intent hash of the spending transaction.

## Banner (required for BLAZE)

- Widget Factory template: https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit?usp=sharing
- Repository: https://github.com/henrysammarfo/cubby
- Community Choice (EMBER 2026) CashTokens address: `bitcoincash:zpuu5t2lxyhykjnfcl8mtxa792pfy88urqv7wrwrmj`

Prize money is paid to the CashTokens address shown in the demo banner. That address was generated into a local gitignored key file. Henry must move the key to a wallet he controls, or replace the banner with an address he already owns, before the repo is public.

## Try the live demo

The live demo is at https://cubby-liart-six.vercel.app. Open it on a phone or laptop with a screen lock. The passkey is bound to this website address, so use this HTTPS origin (not a preview URL) when you create a phone lock.

1. Stay on the test network (the default). Those coins have no value.
2. Optionally connect a Bitcoin Cash wallet with WizardConnect. In Paytaca, open Apps, then WizardConnect, then Scan (the usual Scan button does not connect). If it hangs, tap New code on the demo for a fresh code. Selene and Cashonize can scan or open the connection link. Stay on the test network, or tick Use the main network in the menu (sending on the main network stays off).
3. Create your phone lock. It is tied to this website address.
4. Send at least 20 000 test units to the box address (or paste the payment id after you send). The on-chain check is a large transaction, about 10 KB, and the fee is 1 unit per byte, so a smaller deposit cannot cover the send.
5. Send the coins back with your face or fingerprint (see docs/FACE-ID-TEST.md for the iPhone Safari path on this origin). A real iPhone Face ID spend on the live site has not been completed yet.
6. Open the payment on the explorer.

Main network sending stays off until Henry approves the funding address and the exact number of satoshis (20 000 satoshis, which is 0.0002 BCH, is the planned amount).


## Completed test network spend

These are real chipnet transactions (coins have no value). They were built by the end-to-end script using a software passkey that produces a byte-exact WebAuthn assertion.

- Deposit into the box: https://chipnet.bchexplorer.info/tx/8f9e1dd30944559c095e43ab911551dd14acafe32abfa199d58238cc0948f5e7
- Passkey spend: https://chipnet.bchexplorer.info/tx/2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993
- Box address: `bchtest:pwh5d9m9akqawmr4aczes0auk426kkftpsthn99tqex3xdatjc7zsdcfzwewk`

These proof payments are documented here and in docs/ARCHITECTURE.md. The in-app demo box (`?demo=1`) shows them with a “Demo box” label. They are not presented as a visitor’s own phone spend.

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
npm test              # unit tests: acceptance, negatives, wallet link, WebAuthn parsing
npm run typecheck
npm run dev           # Next.js app at http://localhost:4173
npm run build         # typecheck, unit tests, then next build
npx tsx scripts/chipnet-e2e.ts   # faucet, fund, software passkey spend on chipnet
npx tsx scripts/ui-auth-e2e.ts    # virtual authenticator through the real UI (needs chipnet coins)
npx tsx scripts/ui-smoke.ts        # screenshots of every route at 390 and 1440
```

The app is Next.js 15 (App Router) in `app/`. Protocol code is unchanged in `src/`. Live passkey and WizardConnect clients stay in `web/passkey.ts` and `web/wizard.ts`.

Routes: `/` landing, `/film`, `/welcome` (splash, slides, hello, face, ready), `/wallet`, `/wallet/bch`, `/receive`, `/send`, `/send/success`, `/activity`, `/activity/[tx]`, `/connect`, `/settings`, `/allowance`, `/id`, `/how-it-works`, `/terms`, `/privacy`. `/send/review` redirects to `/send`. Add `?demo=1` to open the labelled demo box (real chipnet payments `8f9e1dd3…` and `2ac70a7c…`).

`harness/passkey-device-check.html` is still there for collecting a raw device assertion.

## Where to read

- `app/`: the live Next.js app (landing and box screens)
- `web/passkey.ts`, `web/wizard.ts`: phone lock and WizardConnect clients used by those screens
- `src/covenant.ts`: the on-chain check (CashAssembly generated with a small named-stack helper, `src/asm.ts`)
- `src/vault-spend.ts`, `src/p2pkh-send.ts`, `src/chain.ts`: payment building and explorer access
- `test/gate.test.ts`: acceptance tests from plan section 6.1 plus negative cases
- `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/FACE-ID-TEST.md`, `docs/AUDIT.md`, `docs/BOUNTIES.md`
- `DOCS_NOTES.md`: every protocol fact used, with source and date

## Limitations

- **Size margin.** The unlocking bytecode sits about 140 to 670 bytes under the 10,000-byte standard limit. If a signature ever lands over, `unlockFromAssertion` throws `UnlockingTooLargeError` and the app should ask for one more approval (a new signature changes the size). Not seen in 450 test signatures.
- **Empty immutable NFTs are invisible to introspection.** `OP_OUTPUTTOKEN*` cannot tell "fungible tokens only" from "fungible tokens plus an immutable NFT with an empty commitment". Creating one needs a minting NFT of that category in the transaction, and removing one is a burn; Cubby vaults do not hold such NFTs. Documented by a test.
- **Other inputs are not signed.** Like `SIGHASH_ANYONECANPAY | ALL`: anyone can add inputs (which can only add fee); each vault input needs its own signature over its own outpoint.
- **Transaction id malleability.** A third party can re-encode the hints or padding of an unconfirmed spend (same effect, new txid). Do not build unconfirmed chains on top of a vault spend until it confirms.
- **Locktime** must be below 2^31 (fits a 4-byte script number), true for all block heights and for timestamps until 2038.
- **Real devices** (iPhone, Android, Windows) still need a check on the live HTTPS origin; the automated chipnet run uses a software P-256 authenticator that produces byte-exact WebAuthn assertions.
- **The box is bound to one website address** (`rpIdHash` is fixed in the redeem script).
- **Chipnet faucet APIs from this build environment are unreliable.** Ninja often returns a submitted payment id that never appears, and Apecs has been failing with Fulcrum 502s. The completed test spend below was funded by a Googol chipnet drip to a local test key, then deposited and spent by the end-to-end script.

## Credit

Sahid Miller (SeedlessBCH, signatures.cash, @SeedlessCash) showed the first Pay-to-P-256 transaction on BCH chipnet on 21 Jan 2026 and first pitched passkey-signed BCH. Cubby builds on that idea. His repository has no licence, so **no code was copied**: every line here is written fresh, and the verifier uses a different method (single input, hint-checked affine arithmetic with half-size scalars, intent hash by introspection).

## Licence

Not yet chosen. Private repository.

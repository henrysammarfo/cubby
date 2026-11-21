# BLAZE 2026 sponsor bounty plan (branch `bounties`)

Checked 21 November 2026, Accra (UTC+0), against https://bchblaze.cash/bounties (6 bounties). The official rules let one project enter as many bounties as it wants. Judging runs 23 to 27 November.
Cubby stays one product. Each bounty feature is a small add-on to the passkey vault, and logic lives in `src/bounties/` with tests. UI notes are in `docs/integration/`.

## Summary

| Bounty | Prize | Fit | Effort | Status now |
|---|---|---|---|---|
| Best SolidCash Application (mainnet_pat) | 3.5 BCH (2 / 1 / 0.5) | Yes | Medium | **Partly met.** Contract, SolidHat tests and a chipnet lifecycle are done. Mainnet run not done (needs Henry's approval and funds). |
| Migrate to XO (General Protocols) | 1 BCH × 5 | Yes | Medium | **Partly met.** Template, follow-ups and offline XO/VM tests are done. Chipnet invitation run blocked by box network. Feedback must be Henry's own words. |
| Build with XO (General Protocols) | 0.3 BCH × 10 | Yes (same template) | Low on top of Migrate | **Partly met**, same gaps as Migrate. |
| Decentralized Identity (Paytaca) | $500 PUSD | Yes | Medium | **Mostly met** in code and on chipnet: creation, two-key binding, discovery, verify, challenge login, pay by identity. Not yet published to public Nostr relays (posting needs Henry). No UI screen yet. |
| FoldingCash pull-based claims | 26M FLDCH | Partial idea, no build | High | **Not met.** Needs a Merkle-root reward pool, receipt NFTs, root timelock and a several-hundred-leaf chipnet demo. It does not fit a personal vault, and there was not enough time to do it well. |
| Stablecoin Bridge (BCH BLAZE) | $750 PUSD | No | Very high | **Not met.** Needs a cross-chain bridge or swap (e.g. USDC on ETH ↔ PUSD) with WalletConnect on the other chain. Cubby has no token bridge; building one is a separate product and would need mainnet liquidity. |

## Best SolidCash Application

**Requirements (official):**
- a Solidity-syntax contract compiled natively with SolidCash;
- it runs on mainnet;
- judged on using many SolidCash features and syntax variety;
- testing with solidhat is mandatory;
- PRs to SolidCash are encouraged;
- the UI only needs to show the contract lifecycle.

**How Cubby meets it.** "Cubby Allowance" is a pocket money jar owned by a Cubby passkey vault: `bounties/solidcash/contracts/CubbyAllowance.scash`, compiled with solidc 0.51.1 to 215 bytes of 2026 CashVM.
- **Features used:**
  - pragma, file-level constants and a free `view` function with a `for` loop over `tx.inputs`;
  - a contract with constructor params, a `modifier` with `_`, and two public functions (4-byte selector dispatch);
  - `require` with messages and `if/else`;
  - `uint` casts and arithmetic, `bytes` equality and `0x` literals;
  - introspection (`tx.inputs`, `tx.outputs`, `.value`, `.lockingBytecode`, `.tokenCategory`, `this.activeInputIndex`);
  - relative timelock through `this.age`.
- **Design:**
  - the claim is pull-based; it is exact, so nobody can grief the child;
  - change returns to the same jar;
  - owner actions require co-spending the Cubby vault, which checks a passkey signature over every output.
- **SolidHat:** `bounties/solidcash/test/CubbyAllowance.solidhat.ts`, 7 tests on `MockNetworkProvider` (production profile), including the passkey-signed manage path and three failure cases.
- **App code:**
  - `src/bounties/allowance.ts` and generated `src/bounties/allowance-artifact.ts`;
  - `test/allowance.test.ts`, 11 tests;
  - SDK and app encodings match byte for byte.
- **Chipnet lifecycle** (`docs/proofs/allowance-chipnet.json`):
  - fund `a5dc514c8a492f9329e96711b5a835e234413909a4f308bd777f703e5d4de67b`;
  - passkey manage/top-up `1f1eacdbc748df4c049aab2c536b37653e04558cb1da35c376f8483d17e21cc6`;
  - claim `62626f49b6c2151374a0160c9ee549e81a52b18187f07e061a7b765c770ef517`.

**Gaps:**
- A mainnet run (fund, claim, manage with tiny amounts). The script `scripts/bounties/allowance-chipnet.ts` is chipnet-only on purpose; it needs Henry's go-ahead, a funded mainnet address and a cap.
- Optional SolidCash PRs, which are external posts that need Henry.
- A UI lifecycle screen (see `docs/integration/allowance.md`).

## Migrate to XO / Build with XO

**Requirements (official):**
- a novel, functional XO template;
- a chipnet or mainnet transaction executed from an invitation, inspectable at blaze.xo.cash, with the invitation submitted;
- follow-up actions;
- the template, invitation and reproduction steps;
- links to the original and the XO version (Migrate only);
- about 500 words of personally written feedback (AI-written feedback is rejected);
- the latest engine (`next` tag).

**How Cubby meets it.** `bounties/xo/` migrates the Cubby Allowance jar to XO using the unchanged SolidCash bytecode, so XO, the app and the SDK share one address.
- Start action `createJar`.
- Follow-ups on every jar coin: `claimAllowance`, `claimLast` and `manageJar`. The passkey vault input comes in as an external commit.
- Engine `0.1.1-next.18230317763`.
- Tests (7): XO schema validation; XO compiles the app's exact P2SH32 address; claim, last claim and manage transactions built from XO-compiled pieces pass the BCH 2026 VM; early claim and vault-less manage are refused.
- JSON export: `bounties/xo/dist/cubby-allowance.xo-template.json`.

**Gaps:**
- **Chipnet invitation run.** `Engine.create` needs Electrum, which chipnet only serves on ports 50001 to 50004. This box's network blocks them, and I did not route around that. Henry can do it on a normal connection by following `bounties/xo/README.md`, which takes about 20 minutes with chipnet coins.
- **Feedback.** Henry must write it himself. `bounties/xo/FEEDBACK-NOTES.md` lists facts only.
- **manageJar inside XO is unproven.** The external-commit path for the passkey vault input has not been run through a live invitation.

## Decentralized Identity (Paytaca)

**Requirements (official):**
- identity creation;
- a cryptographic binding between a BCH identity and a Nostr identity, with proof of control of both and no key reuse;
- decentralized discovery;
- verification and challenge-response login;
- a working demo with docs;
- stretch goals: identity-based payments and BCH-backed commitments.

**How Cubby meets it.** "Cubby ID" (`src/bounties/identity.ts`, `test/identity.test.ts` with 11 tests):
- **Binding.**
  - A NIP-39 kind-10011 event with an `i` tag `cubby-chipnet:<vault address>`. The Nostr key (secp256k1) signs it.
  - A WebAuthn P-256 passkey assertion over the same statement proves control of the vault.
  - The vault address is derived from that passkey, so the two keys are distinct by construction.
- **Commitment.** An optional BCH-backed commitment: the vault itself spends an OP_RETURN `CUBBYID <npub> <statement hash>`, checked by the on-chain covenant.
- **Discovery.** Relay queries by Nostr key or by `#i` vault tag, and only verified events are kept.
- **Login.** NIP-42-style kind 22242 challenge, with an optional passkey second factor and replay rejection.
- **Pay by identity.** Look up the npub, verify it, then pay the vault.
- **Chipnet** (`docs/proofs/identity-chipnet.json`):
  - anchor `09a08b42d23f4cf4525fe616cdc65ebb98053f4654a19f15bb7fc7d794cd4361`;
  - pay-by-identity `6c6972a9abe4b8377ce10a3313c8298be1b16a84160f4074bc03d1ff49b33fc5`;
  - npub `npub104530m4t6vyvw3qj9uhq0n5ny33t0wfn03hk5hr7f27zvxtzt42qs0tnqe`.

**Gaps:**
- Publishing to public relays. That is a post, so Henry has to choose the relay and say go: `npm run bounties:identity -- --publish wss://...`.
- A UI screen (`docs/integration/identity.md`).

## FoldingCash and Stablecoin Bridge

These are not attempted, for the reasons in the table. Submitting weak entries would cost judging credibility, and neither fits a seedless personal vault without becoming a second product.

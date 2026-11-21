# Truth audit

Checked 21 November 2026, Accra (UTC+0). Every public claim on the live site, in README and docs, in `/workspace/bch/submission` drafts, and in code comments was reviewed. Claims that were false or half-true were fixed in the product or the wording, or cut.

Legend: **true**, **partial**, **false**, **cut**.

## Counts

- True: 28
- Partial (reworded or narrowed): 9
- False (fixed or cut): 6
- Still unproven on a real iPhone: 1 (device Face ID on the production origin). A Chromium virtual authenticator created a box through the real UI on 21 November 2026; a fund and spend through that UI did not complete (see docs/FACE-ID-TEST.md).

## Site (live demo copy)

| Claim | Verdict | Proof or fix |
|---|---|---|
| “A box only your face can open.” | **partial** | The box opens when this device’s screen lock (Face ID, fingerprint, or Windows Hello) approves a WebAuthn assertion. The chain checks that assertion; it does not see a face. Kept as plain-language headline, with the one-line explanation under it. `app/page.tsx` landing. |
| “Lock Bitcoin Cash with Face ID or your fingerprint. The chain checks the approval itself.” | **true** (wording tightened) | Redeem script rebuilds the payment intent and checks the WebAuthn wrapper, including UP and UV flags: `src/covenant.ts` lines 167–182, flag check at line 178. Not a claim that a real iPhone Face ID spend has already been completed. |
| “Bitcoin Cash · test network ready” | **true** | Default network is chipnet, `src/network.ts` `DEFAULT_NETWORK`. |
| “Test network coins have no value. Sending on the main network stays off until it is approved.” | **true** | `NETWORKS.mainnet.allowBroadcast` is `false` (`src/network.ts`). Broadcast throws if flipped without approval (`src/chain.ts` `broadcastTransaction`). |
| “Works with Paytaca, Selene and Cashonize.” (meta description) | **true** for WizardConnect | Connect path uses `@wizardconnect/dapp` (`web/wizard.ts`). Paytaca path is Apps → WizardConnect → Scan, documented on the Receive screen. Zapit and unverified wallets are not claimed. |
| “Built fresh during BLAZE, first commit 17 Nov” linking `18c652e` | **true** | `git log --reverse`: `18c652e` 17 Nov 2026 17:37 UTC, “S1 signing gate…”. |
| Banner EMBER address `bitcoincash:zq7mt4punl9enxeznfrar0xhl6y0p5y5jg3pst20qj` | **true** | Same address in `src/banner.ts`, the live banner, the deck, and the BUIDL draft. Henry supplied this Paytaca token-aware address on 21 November 2026, Accra (UTC+0). |
| Widget Factory intro link | **partial** | The link is the official template. The project deck is **not built yet**. The banner still points at the official template so judges have the required slot. Honest: this is not “our finished deck”. |
| “A real iPhone Face ID check has not been completed yet.” (Box details) | **true** | No production-origin iPhone assertion has been recorded. The chipnet proof spend used a software passkey (README and `scripts/chipnet-e2e.ts`). |
| Old hero: “Face ID signs on this phone”, “Checked on chain”, “No seed phrase” stickers, “Passkey spend” tickets without saying software | **cut** | Removed with the marketing-page redesign. The software-passkey chipnet spend remains documented in README and `docs/ARCHITECTURE.md`, clearly labelled as a software passkey, not a phone Face ID. |
| “Face ID verified” | **cut / never used after this audit** | Forbidden until Henry completes the live iPhone path. Not present in current UI copy. |

## README (before this audit, then fixed)

| Claim | Verdict | Proof or fix |
|---|---|---|
| Signing gate tested “20/20 unit tests” | **false** → fixed | Suite is now 34 tests (`npm test`). README updated. |
| Live demo deployed at https://cubby-liart-six.vercel.app | **true** | Production alias, Vercel project teamtitanlink/cubby. |
| Real chipnet deposit `8f9e1dd3…` and spend `2ac70a7c…` | **true** | Explorer links in README. Built by `scripts/chipnet-e2e.ts` with a **software** passkey. README already said that; the site no longer implies otherwise. |
| Repo still private; no mainnet coins spent | **true** | Origin is private; `allowBroadcast` is false on mainnet. |
| First commit 17 Nov / `18c652e`; no earlier repo | **true** | Git history. |
| Phone lock is bound to this website address | **true** | `rpId` is `location.hostname`, hashed into the redeem script (`web/passkey.ts`, `src/covenant.ts` line 179). |
| Paytaca Apps → WizardConnect → Scan; New code if it hangs | **true** | Receive screen copy; `src/wallet-link.ts` 20s timeout; `web/wizard.ts`. |
| “Send the coins back with your face or fingerprint” | **partial** | The app requests a platform authenticator with `userVerification: 'required'` (`web/passkey.ts`). A real iPhone Face ID spend on the production origin is still unproven. README now says that plainly. |
| Redeem script 1,077 bytes; unlocking 9,333–9,721 (150 sigs); op cost ~81% | **true** | `scripts/report.ts` / `DOCS_NOTES.md` 17 Nov 2026 measurements, libauth 3.1.0-next.8. |
| `web/` “minimal, token based styles, no logo” | **false** → fixed | The app has a logo and a designed UI. README “Where to read” updated. |
| Other inputs are not signed; size near 10 KB; origin binding; real devices still need a live-origin check | **true** | Kept, and moved into `docs/SECURITY.md`. |
| Sahid Miller prior art; no code copied | **true** as a project assertion | His repo is unlicensed; this repo is a new implementation (different method). Cannot cryptographically prove a negative; the statement stands as the author’s representation. |

## Submission drafts (`/workspace/bch/submission`)

| Claim | Verdict | Proof or fix |
|---|---|---|
| DORA_BUIDL / TELEGRAM: chain checks the approval; chipnet proof txids; first commit; EMBER address; Paytaca path | **true**, with the software-passkey label on the proof spend | Drafts updated so the proof spend is not described as a completed phone Face ID. |
| “On the test network you can… send them back with your face or fingerprint” | **partial** | The UI path exists. A real iPhone run on the production origin is still outstanding. Drafts now say the in-app path is ready and the iPhone check is documented in `docs/FACE-ID-TEST.md`. |
| Presentation: Widget Factory deck to be filled | **true** (not done) | Deck is still unbuilt. |

## Code comments

| Claim | Verdict | Proof |
|---|---|---|
| clientDataJSON prefix follows WebAuthn L3 5.8.1.1 | **true** | `src/covenant.ts` line 27–28; https://www.w3.org/TR/webauthn-3/ section 5.8.1.1. |
| Flags must have UP (0x01) and UV (0x04) | **true** | `src/covenant.ts` line 176–178: `AND 0x05` / `EQUALVERIFY`. Extra flags are allowed. |
| DER ECDSA parse; message hash `sha256(authData \|\| sha256(clientDataJSON))` | **true** | `src/webauthn.ts`, `src/unlock.ts` lines 53–55, 73; WebAuthn L3 6.3.3 and 6.5.5. |
| Low-S is not required by the script | **true** | Range check is `1 <= s < n` only (`src/covenant.ts` lines 184–187). High-S from a device is accepted. |
| Half-size scalars: Antipa et al., SAC 2005 | **true** | `src/covenant.ts` header; `src/hints.ts`. |
| Intent hash is rebuilt by introspection, not a sighash | **true** | `src/covenant.ts` lines 118–127 (`OP_OUTPOINTTXHASH`, `OP_OUTPUT*`, `OP_TXOUTPUTCOUNT`, `OP_BEGIN`/`OP_UNTIL`). |

## Cuts made in this pass

- Marketing sections below the hero (proof tickets, vignettes, business tiles, anime empty states) were removed from the product UI so the app is a real box, not a landing full of filler.
- “Face ID signs on this phone” and any wording that could be read as “Face ID verified” were removed.
- Software-passkey chipnet tickets are no longer presented on the site as if they were a visitor’s phone spend. They remain in README and architecture docs, labelled honestly.
- README “20/20 tests” and “no logo” are corrected.
- BUIDL/Telegram drafts no longer imply a completed real-phone Face ID spend.

## Front end structure (same day, later pass)

The public site is now a Next.js 15 app in `app/`, still on https://cubby-liart-six.vercel.app. Protocol behaviour and the claims above are unchanged. Demo screens that show the chipnet proof payments are labelled “Demo box”. Fiat amounts and the coin chart appear only when CoinGecko returns a price.

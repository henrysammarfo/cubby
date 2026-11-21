# BLAZE 2026 tracks and bounties

Sources checked 21 November 2026, Accra (UTC+0):

- Official event: https://bchblaze.cash/ and https://dorahacks.io/hackathon/bchblaze2026
- Official bounties: https://bchblaze.cash/bounties/
- Mainnet-track rules as published for BLAZE 2026 (live demo, WizardConnect, Widget Factory template, banner CashTokens address, originality, Telegram confirmation, roll call, and at least one mainnet send feature). Jeremy’s Telegram enforcement notes are treated as binding for the same items (banner address, WizardConnect not only WalletConnect v2, no hanging connect, gap-limit scan).

Cubby is entered on the **Mainnet track**. It does not enter the Media track. Sponsor bounties are listed honestly; Cubby does not currently qualify for them.

## Mainnet track

| Requirement | Status | Working code | Live proof |
|---|---|---|---|
| Register on DoraHacks before 13 Nov and submit by Sun 22 Nov 14:00 UTC | **Met by Henry for registration.** Submit is **not sent yet**. | n/a | Henry confirmed registration and roll call (MEMORY.md). Draft only: `/workspace/bch/submission/DORA_BUIDL.md`. |
| Live, clickable demo judges can open | **Met** | `web/index.html`, deployed from this repo | https://cubby-liart-six.vercel.app |
| WizardConnect integration | **Met** | `web/wizard.ts` (`startConnect`, `requestWalletSend`); `@wizardconnect/core` + `@wizardconnect/dapp`; relay `wss://relay.riften.net:443`. Disconnect watch: `src/wallet-link.ts`. Address scan in batches of 20: `src/wallet-scan.ts`. | Live Receive screen, “Or connect a wallet you already use”. |
| Banner with presentation, source, and EMBER 2026 CashTokens address | **Partial** | Banner in `web/index.html` (`#widgetLink`, `#repoLink`, `#emberAddress`). Address `bitcoincash:zpuu5t2lxyhykjnfcl8mtxa792pfy88urqv7wrwrmj` from `src/banner.ts`. | Visible on the live site. The presentation link is the official Widget Factory **template**; the project deck is **not built**. |
| Original work built during BLAZE (no minor tweak of an earlier product) | **Met** | First commit `18c652e` (17 Nov 2026) | https://github.com/henrysammarfo/cubby/commit/18c652e (repo still private until Henry flips it). |
| Confirm the team is real in the BLAZE Telegram | **Not met (draft only)** | n/a | `/workspace/bch/submission/TELEGRAM_CHECKIN.md` is unsent. |
| At least one project representative attended a prep stream (roll call) | **Met (Henry)** | n/a | Henry confirmed roll call. |
| At least one feature that sends a Bitcoin Cash **mainnet** transaction | **Not met** | Mainnet is a config flip (`src/network.ts`, `allowBroadcast: false`). The live send path is the same code, but broadcast stays off until Henry approves the funding address and exact sats. | Chipnet only: deposit `8f9e1dd30944559c095e43ab911551dd14acafe32abfa199d58238cc0948f5e7`, spend `2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993`. No mainnet send. |

## Core CashVM 2026 features in the live spend path

There is no separate “use CashVM” bounty, but the Mainnet track and the hackathon’s 2026-upgrade emphasis are met in the **actual spend**, not only in copy. `web/main.ts` builds the unsigned spend (`src/vault-spend.ts` `buildUnsignedVaultSpend` + `attachPasskeyUnlock`), which calls `src/unlock.ts` `unlockFromAssertion`. That unlocking bytecode runs this redeem script:

| 2026 feature | Where it is used | What it does |
|---|---|---|
| Transaction introspection | `src/covenant.ts` 118–127 | `OP_OUTPOINTTXHASH`, `OP_OUTPOINTINDEX`, `OP_TXOUTPUTCOUNT`, `OP_OUTPUTVALUE`, `OP_OUTPUTTOKENCATEGORY`, `OP_OUTPUTTOKENCOMMITMENT`, `OP_OUTPUTTOKENAMOUNT`, `OP_OUTPUTBYTECODE` rebuild the intent hash of the spending transaction. |
| Loops (`OP_BEGIN` / `OP_UNTIL`) | `src/covenant.ts` 121–127, 133, 162, 237–250, 260 | Output walk for the intent hash; base64url of the challenge; hint-chunk load; 128-bit joint double-and-add; clean stack. |
| Functions (`OP_DEFINE` / `OP_INVOKE`) | `src/covenant.ts` 45, 153–158, 246 | Modular reduction, hint pop, point add, point double, base64 alphabet, and the field prime / curve order, invoked from the verifier. |
| Bitwise / shifts | `src/covenant.ts` 135, 239–242 | `OP_RSHIFTNUM` / `OP_LSHIFTNUM` for base64 and for digit extraction in the main loop. |

On-chain proof that this script ran: chipnet spend `2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993` (software passkey, 9,573 unlocking bytes). A Chromium virtual authenticator created a box through the real UI on 21 November 2026 (`scripts/ui-auth-e2e.ts`, last address `bchtest:pwp9y7cd8w00x8v72cvxeztlfckxr5xcwcvp86yn7cslw76nm9su2l0uhvdfc`), but a fund and spend through that UI did not complete (Apecs 502; Ninja payment id `3a1d2fefd26fcba680b690b237d3a466273f03143e881a930f6d2523bc8282ff` never appeared; captcha faucets were not used). A real iPhone Face ID spend on the production origin is still outstanding (`docs/FACE-ID-TEST.md`).

## Sponsor bounties (https://bchblaze.cash/bounties/)

| Bounty | Sponsor / prize | Status | Why |
|---|---|---|---|
| Stablecoin Bridge | ParyonUSD, $750 PUSD | **Not met** | Requires bridging or swapping stables into and out of BCH (for example USDC on another chain ↔ PUSD). Cubby does not bridge tokens. |
| Build with XO | General Protocols, 0.3 BCH × 10 | **Not met** | Requires a novel XO template, a chipnet or mainnet invitation inspectable in the XO debug tool, and personally written XO feedback. Cubby does not use XO. |
| Migrate to XO | General Protocols, 1 BCH × 5 | **Not met** | Requires migrating existing functionality to XO and linking old and new projects. Not done. |
| Decentralized Identity | Paytaca, $500 PUSD | **Not met** | Requires a non-custodial cryptographic binding of a BCH identity and a Nostr identity, plus decentralized discovery and challenge-response. A passkey box is not a BCH↔Nostr identity link. |
| Best SolidCash Application | 3.5 BCH (2 / 1 / 0.5) | **Not met** | Requires a Solidity contract compiled with SolidCash, tested with solidhat, and runnable on mainnet. Cubby’s contract is CashAssembly / CashVM, not SolidCash. |
| FoldingCash pull-based claims | 26M FLDCH | **Not met** | Requires an on-chain Merkle-root reward pool, proof verification, double-claim prevention, and a chipnet demo. Out of scope. |

## After the deadline

Do not mark any unmet requirement as met without new proof. Mainnet sending stays off until Henry approves the address and amount. The Telegram check-in and DoraHacks submit stay unsent until he asks. The repo stays private until he asks. The Widget Factory deck is still to be built.

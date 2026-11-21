# MEMORY: Cubby (BCH BLAZE 2026)

## Scope approved by Henry (21 Nov 2026, Accra)
Henry confirmed he registered on DoraHacks before 13 Nov, completed roll call, and lifted the 17 Nov freeze to full scope for the BLAZE submission.
- Build a live demo (create or fund a vault, spend with a device passkey), WizardConnect, and a chipnet end to end run with real transaction IDs.
- Deploy to a free Vercel origin. Lock the passkey relying party to the deploy origin. Do not buy a domain.
- Commit and push to henrysammarfo/cubby is allowed. Never force push. Never commit secrets. Do not make the repo public until Henry says so.
- Do not spend real mainnet BCH until Henry approves the funding address and the exact number of satoshis.
- Credit Sahid Miller / signatures.cash as prior art. Copy nothing from his unlicensed repo. Do not use the name Pocket.
- Commit as henrysammarfo <jasonneil4040@gmail.com>.
- UI: keep it minimal and easy to restyle (design tokens, no final branding or logo) until Telegram research decides the look, logo, and mascot.

## Earlier scope (17 Nov 2026, via Hack Lab / New Bot) — lifted
Was: "Yes, Builder can start the signing gate test now alongside the design, backend only, nothing public and no spending". S1 only, backend only, no UI, nothing public, no mainnet, no spending. That freeze is lifted as of 21 Nov 2026.

## Decisions
- One-input verifier (no helper UTXOs): half-size scalars + hint-checked affine steps. Keeps the plan's approach (introspection intent hash, WebAuthn wrapper in script, clean stack, padding) and removes plan T3's helper inputs.
- P2SH32 (redeem script about 1 KB cannot fit the 201-byte P2S locking limit).
- rpIdHash is fixed per vault, so a vault is bound to one passkey domain (the live demo origin).
- Default network is chipnet. Mainnet is a config flip, but broadcasting a mainnet spend stays off until Henry approves the address and amount.

## hack-team-standards checklist
- [x] Read the plan sections 2.2, 6, 6.1 and the r6 spikes
- [x] Sponsor tech essential: CashVM 2026 loops/functions/bitwise used directly
- [x] Every protocol fact sourced and dated (DOCS_NOTES.md)
- [x] Typed (TypeScript strict), tested (vitest)
- [x] Credit line for Sahid Miller, no copied code
- [ ] Real device assertions (iPhone, Android, Windows 11)
- [ ] Chipnet spend
- [ ] Mainnet spend (needs Henry's approval of the funding address and exact sats)


## Jeremy / Telegram rules (must be in the app)
- Prize is paid to the BCH CashTokens address on the project's own demo banner. No address in the banner means disqualification.
- WizardConnect (not only WalletConnect v2): detect wallet drop, do not hang on "finding a secure connection", clear connect/disconnect/reconnect states, errors, and timeouts. "Copy connection link" under the QR; clicking the QR also copies the link; brand the QR with the wizard hat.
- Show the connected wallet's BCH balance, and PUSD if any, at the top right.
- Confirm and review actions open a modal.
- Validate addresses against the app network (chipnet vs mainnet) and keep a visible network switch.
- Hero: one sentence plus a graphic of the main feature, understood in 5 seconds.
- "My activity" page: vault deposits and spends with explorer links. First screen must show value immediately (guided demo / completed test spend).
- Pre-existing work must list old and new demo and repo. Cubby is new (repo created 17 Nov 2026); there is no earlier demo or repo.

## Public payout address
EMBER 2026 CashTokens address shown in the banner: `bitcoincash:zpuu5t2lxyhykjnfcl8mtxa792pfy88urqv7wrwrmj`.
The matching private key is only in the gitignored `.secrets/` file. Henry must secure that key or replace the banner address with one he already controls. Do not print or commit the key.

## Chipnet e2e (21 Nov 2026, Accra)
Not yet on chain. Ninja faucet claims return a submitted txid that never appears on chipnet.bchexplorer.info, Watchtower, Selene, or imaginary.cash (same chain tip as Ninja, height 341240 at the time). Apecs claims fail after a valid proof of work with HTTP 502 Fulcrum websocket errors. Do not bypass faucet rate limits or captchas. Funding address for a later drip (no keys here): `bchtest:qpl93ln6r425c60fqhc25sf4sh59fmwwrufym39tj0` (needs at least 20 000 units).

## Live demo (21 Nov 2026, Accra)
Public Vercel production URL: https://cubby-liart-six.vercel.app
Project: teamtitanlink/cubby (Hobby). Vercel SSO/deployment protection was disabled so judges can open it without a login. Repo is still private. No chipnet spend txids yet.

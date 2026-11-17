# MEMORY: Cubby (BCH BLAZE 2026)

## Scope approved by Henry (17 Nov 2026, via Hack Lab / New Bot)
"Yes, Builder can start the signing gate test now alongside the design, backend only, nothing public and no spending".
- S1 only. Backend only, no UI, nothing public, no mainnet, no spending.
- Repo private. Commit as henrysammarfo <jasonneil4040@gmail.com>. No force pushes. No keys, seeds or credentialed RPC URLs anywhere.
- Credit Sahid Miller; copy nothing from his unlicensed repo. Do not use the name Pocket. Do not buy cubby.cash.
- Mainnet test needs Henry's approval of the funding address and exact sats (Hack Lab asks him).

## Decisions
- One-input verifier (no helper UTXOs): half-size scalars + hint-checked affine steps. Keeps the plan's approach (introspection intent hash, WebAuthn wrapper in script, clean stack, padding) and removes plan T3's helper inputs.
- P2SH32 (redeem script about 1 KB cannot fit the 201-byte P2S locking limit).
- rpIdHash is fixed per vault, so a vault is bound to one passkey domain. Device tests need Henry's chosen domain (or a test origin he approves).

## hack-team-standards checklist (relevant items for S1)
- [x] Read the plan sections 2.2, 6, 6.1 and the r6 spikes
- [x] Sponsor tech essential: CashVM 2026 loops/functions/bitwise used directly
- [x] Every protocol fact sourced and dated (DOCS_NOTES.md)
- [x] Typed (TypeScript strict), tested (vitest)
- [x] Credit line for Sahid Miller, no copied code
- [ ] Real device assertions (iPhone, Android, Windows 11)
- [ ] Chipnet spend
- [ ] Mainnet spend (needs Henry's approval)

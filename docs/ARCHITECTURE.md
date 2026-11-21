# How the phone-lock check works

Cubby’s box is a P2SH32 Bitcoin Cash output. The redeem script, not a server, checks that a WebAuthn (passkey) approval matches the exact payment being spent. This document is for readers who want the mechanism. The in-app UI never uses these words.

## Path of a send

1. The app builds an unsigned 1-input transaction (`src/vault-spend.ts`, `buildUnsignedVaultSpend`). The destination, optional change back to the box, fee, version, and locktime are fixed before approval.
2. The WebAuthn challenge is the intent hash of that transaction (`src/intent.ts`, exposed as `challengeForSpend`).
3. The device produces an assertion (`web/passkey.ts`, `requestAssertion`): algorithm ES256 (`alg: -7`), `userVerification: 'required'`, `rpId` equal to the hostname the box was created on (production: `cubby-liart-six.vercel.app`).
4. The app parses the DER signature, splits `clientDataJSON`, and builds unlocking bytecode (`src/unlock.ts`, `unlockFromAssertion`).
5. `attachPasskeyUnlock` runs the 2026 virtual machine locally (`createVirtualMachineBch2026`) and only then broadcasts (`src/chain.ts`).

## What the redeem script checks

Source: `src/covenant.ts`, function `buildRedeemAsm`.

1. **Intent hash by introspection** (lines 118–127, 167–169). The script rebuilds `sha256(outpoint txid | outpoint index | version | locktime | output count | each output’s value, token fields, and locking bytecode)` from the transaction it is running in. Changing any output, or replaying the signature on another coin, fails.
2. **WebAuthn `clientDataJSON`** (lines 27–28, 171–174). The script prefixes the official serialization `{"type":"webauthn.get","challenge":"` (WebAuthn Level 3, section 5.8.1.1, https://www.w3.org/TR/webauthn-3/), appends the 43-character base64url challenge, and requires the spender’s suffix to start with `"` so the challenge string is closed. The rest of the suffix (origin, `crossOrigin`, and any extra members such as Chrome’s occasional `other_keys_can_be_added_here`) is hashed as the authenticator produced it.
3. **authenticatorData** (lines 176–179). The vault’s fixed `rpIdHash` (`sha256(rpId)`) is prepended to the spender’s tail (flags, counter, optional extensions). The first flag byte must include UP and UV: `(flags & 0x05) == 0x05`.
4. **Message hash** (lines 181–182). `e = sha256(authenticatorData | sha256(clientDataJSON))`, matching WebAuthn Level 3 sections 6.3.3 and 6.5.5.
5. **P-256 ECDSA** (lines 184–260). `1 <= r, s < n`. The point `(r, ry)` must lie on the curve. Half-size scalars (Antipa et al., SAC 2005) and hint-checked affine additions verify `R = u1·G + u2·Q` without an on-chain inversion. Low-S is **not** required (`s` may be in the upper half of the order).
6. **Clean stack** (line 260). Exactly one item (true) remains.

The public key and `rpIdHash` are baked into the script at creation (`buildVault`). Later visits must not ask Safari for the public key again; it is stored on the device at creation (`web/passkey.ts`, `cubby-vault-v1` in `localStorage`). If `getPublicKey()` is missing at creation, the key is read from the attestation object (`src/webauthn.ts`, `publicKeyFromAttestationObject`).

## Sizes

Measured with libauth 3.1.0-next.8, standard 2026 VM (`DOCS_NOTES.md`, 17 Nov 2026): redeem script 1,077 bytes (P2SH32 locking 35 bytes); unlocking 9,333–9,721 bytes over 150 signatures; full 1-in 1-out transaction about 9.6–9.9 KB. The standard unlocking limit is 10,000 bytes.

## Credit

Sahid Miller (signatures.cash) first showed a Pay-to-P-256 spend on chipnet on 21 Jan 2026. Cubby is a new implementation. His repository has no licence; no code was copied. The verifier is a single input, with hint-checked affine arithmetic, half-size scalars, and an intent hash rebuilt by introspection.

# DOCS_NOTES: protocol facts used, with source and date checked

All times Accra (GMT). Checked Tue 17 Nov 2026 unless noted.

## CashVM 2026 rules
- The 15 May 2026 upgrade activated CHIP-2024-12 P2S, CHIP-2021-05 Loops (OP_BEGIN/OP_UNTIL), CHIP-2025-05 Functions (OP_DEFINE/OP_INVOKE), CHIP-2025-05 Bitwise (OP_INVERT, OP_LSHIFTNUM, OP_RSHIFTNUM, OP_LSHIFTBIN, OP_RSHIFTBIN). Mainnet MTP >= 1778846400 (15 May 2026 12:00 UTC); chipnet MTP >= 1763208000 (Nov 2025). Source: https://upgradespecs.bitcoincashnode.org/2026-05-15-upgrade/ (v1, 2026-01-09), BCHN v29.0.0 release notes https://docs.bitcoincashnode.org/doc/release-notes/release-notes-29.0.0/ , bchworks.com/upgrades/2026-05-upgrade (first block under new rules: 951,145), blog.bitjson.com/bitcoin-cash-upgrade-2026 (chipnet active at block 279,792, 15 Nov 2025).
- Standard unlocking bytecode limit 10,000 bytes; standard locking bytecode limit 201 bytes; NFT commitment up to 128 bytes. Source: same bchworks page; libauth 3.1.0-next.8 `bch-2026-consensus.js` (`maximumStandardUnlockingBytecodeLength: 10000`, `maximumStandardLockingBytecodeLength: 201`, `maximumTokenCommitmentLength: 128`).
- Stack item and VM number limit 10,000 bytes (2025 VM limits). Source: libauth `bch-2025-consensus.js` (`maximumStackItemLength: 10_000`, `maximumVmNumberByteLength: 10_000`).
- Operation cost = instructions x 100 + signature checks + hash digest iterations x cost + arithmetic cost + bytes pushed; budget per input scales with `(41 + unlocking bytecode length) x 800`. Source: libauth `measureOperationCost` in `bch-2025-consensus.js`; formula `(41 + len) x 800` matches the VM limits CHIP (github.com/bitjson/bch-vm-limits) and the measured `maximumOperationCost` in our runs (e.g. unlocking 9,594 B -> 7,708,000).
- OP_UNTIL pops a value; zero jumps back to OP_BEGIN, anything else ends the loop. OP_DEFINE pops the identifier, then the body (identifier max 7 bytes). Source: libauth `bch-2026-loops.js`, `bch-2026-functions.js`, `bch-2026-consensus.js` (`maximumFunctionIdentifierLength: 7`).
- OP_RSHIFTNUM is an arithmetic shift on script numbers; a negative value shifted past its length gives -1. Source: libauth `bch-2026-bitwise.js`.
- OP_OUTPOINTTXHASH pushes the outpoint hash in wire (little-endian) order. Source: libauth `common/inspection.js` (`outpointTransactionHash.slice().reverse()`).
- OP_OUTPUTTOKENCATEGORY pushes the category in wire order plus a capability byte only for mutable (0x01) or minting (0x02) NFTs; 0 (empty) when there is no token. Commitment and amount push empty / 0 when absent. Source: libauth `bch-2023/bch-2023-tokens.js` (`pushTokenExtendedCategory`). Consequence: an immutable NFT with an empty commitment is not visible to introspection (README Limitations).

## WebAuthn
- clientDataJSON serialization order is fixed: `{"type":` type `,"challenge":` challenge `,"origin":` origin `,"crossOrigin":` false/true, then optional topOrigin and any extra members; future versions must not reorder or insert fields between them. Source: W3C WebAuthn Level 3 Recommendation 25 Aug 2026, sections 5.8.1.1 Serialization and 5.8.1.2 Limited Verification Algorithm, https://www.w3.org/TR/webauthn-3/ .
- The challenge member is the base64url (no padding) encoding of the challenge bytes; 32 bytes -> 43 characters. Source: same spec (CCDToString of the base64url challenge); RFC 4648 section 5.
- authenticatorData = rpIdHash (32) | flags (1) | signCount (4, big-endian) | optional attested data / extensions. Flags: bit 0 UP, bit 2 UV, bit 3 BE, bit 4 BS. Source: WebAuthn L3 section 6.1 Authenticator Data.
- Assertion signature is over `authenticatorData | sha256(clientDataJSON)`; for ES256 (COSE -7) it is ASN.1 DER ECDSA P-256 with SHA-256. Source: WebAuthn L3 sections 6.3.3 and 6.5.5 (signature formats).
- Chrome adds `,"other_keys_can_be_added_here":"do not compare clientDataJSON against a template. See https://goo.gl/yabPex"` after crossOrigin with probability 0.2 (`base::RandDouble() < 0.2`). Chrome also builds type, challenge, origin, crossOrigin in spec order. Source: Chromium `content/browser/webauth/client_data_json.cc` at tag 140.0.7339.185, https://chromium.googlesource.com/chromium/src/+/140.0.7339.185/content/browser/webauth/client_data_json.cc . Our covenant takes the suffix verbatim, so this passes (tested).

## P-256 and ECDSA
- Curve parameters p, n, a = -3, b, G: SEC 2 v2 section 2.4.2 / FIPS 186-5 (NIST P-256). Verified in code: `test/units.test.ts` checks p = 2^256 - 2^224 + 2^192 + 2^96 - 1 and that G is on the curve.
- Half-size scalar ECDSA verification: Antipa, Brown, Gallant, Lambert, Struik, Vanstone, "Accelerated verification of ECDSA signatures", SAC 2005. We use: find a, b with |a|, |b| < 2^128 and b = a*u2 (mod n) by extended Euclid; then aR = (a*u1)G + bQ. Our script checks b*s = a*r and gamma*s = a*e (mod n), so it never needs s^-1.
- P-256 has prime order (cofactor 1), so no valid point has y = 0; doubling needs no y != 0 check. Additions do check x1 != x2 (mod p).

## Measured in this repo (libauth 3.1.0-next.8, standard VM)
- 17 Nov 2026 17:35: 150 signatures, unlocking 9,333-9,721 B (mean 9,556); with Chrome extra member 9,444-9,860 B (mean 9,652); op cost 0.80-0.81 of budget; zero failures. (`scripts/report.ts`)

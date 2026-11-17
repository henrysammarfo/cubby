# SESSION_LOG

## Tue 17 Nov 2026 (Accra / GMT)

- 17:15 Read plan sections 2.2, 6, 6.1, round-6 notes and the r6 spikes (op-cost model, the 2-input verifier results: 6,798,662 and 7,405,892 op cost, sighash rebuild failing with "bitwise operation on operands of different lengths"). Decided on a fresh single-input design (see MEMORY.md).
- 17:20 Created private repo henrysammarfo/cubby.
- 17:27 First VM pass: unlocking 9,701 B, op cost 6,024,456 / 7,793,600, `vm.verify` true (standard).
- 17:30 Acceptance tests written and passing. Size distribution showed 11/300 over 10,000 B with Chrome's extra clientDataJSON member.
- 17:33 Size fixes: pick the lattice vector needing fewest additions; rpIdHash moved into the script (spender sends only flags+counter); table entry 12 computed at runtime; 1 KB hint chunks. Result: 0/300 over, max 9,860 B.
- 17:35 20 tests pass. Device harness and `scripts/device-check.ts` added (dry-run with a software passkey passes).

### S1 VM results (exact output, `out/s1-results.txt`)
```
valid spend: pass 6243182/7708000; unlocking 9594 B; tx 9810 B
output byte mutations: 163 bytes x 2 masks: 318 decodable mutations all fail=true; 8 undecodable
added / removed / reordered output: fail Program failed an OP_VERIFY operation.
replay: other txid / other index / second vault input in same tx: fail Program failed an OP_VERIFY operation.
locktime / version changed, wrong passkey, wrong rpId, UV flag missing, webauthn.create, unterminated challenge: fail OP_VERIFY
s+1, r+1, R off curve, alpha=0, alpha+n, gamma+1, one hint flipped: fail OP_VERIFY; hints truncated: fail "Tried to read from an empty alternate stack."
zero padding 200 B: pass; non-zero padding: fail
Chrome extra member, Android app origin, BE/BS flags: pass
```

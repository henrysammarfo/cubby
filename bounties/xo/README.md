# Cubby Allowance as an XO template

This ports Cubby's pocket money jar (the SolidCash contract in `../solidcash/contracts/CubbyAllowance.scash`) to an XO template.
The jar bytecode is the solidc 0.51.1 output, unchanged. XO, the Cubby app and the SolidCash SDK therefore lock coins to the same address, and the tests check that.

- Template source: `source/cubby-allowance.mjs`
- Importable JSON: `dist/cubby-allowance.xo-template.json`, rebuilt with `npm run export`
- Template id (XO hash): `d4b677496cb4138e07d3ae561b50f2bd5c2f034a7f0607d44e908bb22c76e80a`
- Packages: `@xo-cash/engine@0.1.1-next.18230317763` (npm "next" tag), plus utils 0.0.12, types 0.0.9 and state 0.0.6

## Actions

| Action | Who | What it does |
|---|---|---|
| `createJar` (start) | owner | Locks `fundSatoshis` in a jar that pays `allowance` every `periodBlocks` blocks to `childLock`. |
| `claimAllowance` (follow-up on every jar coin) | anyone | Pays exactly one allowance to the child and puts the rest back in the same jar. Input sequence = `periodBlocks` (BIP68), which the contract checks with `this.age`. |
| `claimLast` (follow-up) | anyone | When less than allowance + fee + dust is left, pays all of it (minus the 1,000 sat fee) to the child. |
| `manageJar` (follow-up) | owner | Tops up, changes or closes the jar. The owner's Cubby vault must be input 0. The vault checks a passkey signature over the hash of every output. |

`manageJar` and the passkey: the vault input has no XO unlocking script, because the XO engine cannot drive WebAuthn. The vault's unlocking bytecode is made outside XO, after the outputs are final: `manageChallenge` gets the hash, the passkey signs it, then `attachManage` builds the unlock (all in `src/bounties/allowance.ts`). It is then added to the invitation as a commit that carries its own unlocking bytecode. This is the one step not proven inside XO here.

## Tests (offline, real XO packages)

`npm test` runs 7 tests:
- the template passes `parseTemplate` (XO schema validation);
- the bytecode and selectors match the app's generated artifact;
- `compileLockingBytecodeFromTemplateLockingScriptIdentifier` gives the app's P2SH32 jar address for 3 parameter sets;
- the claim, last-claim and manage transactions are built from XO-compiled pieces (unlocking scripts, output scripts, output value expressions, sequence number) and pass the libauth BCH 2026 VM;
- an early claim and a manage without the vault are refused.

## Chipnet invitation run: not done (blocked)

The bounty needs a chipnet transaction executed from an XO invitation and inspected at https://blaze.xo.cash. `Engine.create` needs an Electrum server, and chipnet Electrum is only on ports 50001 to 50004. The build box's network blocks those ports, so no invitation was run here. The same contract is proven on chipnet through the Cubby app path; see `docs/proofs/allowance-chipnet.json`.

To reproduce on a machine with normal internet:
1. Open the XO wallet / debug tool at https://blaze.xo.cash on chipnet and import `dist/cubby-allowance.xo-template.json`.
2. Start `createJar` with these variables:
   - `ownerVaultLock`: a Cubby vault locking script (hex);
   - `childLock`: a P2PKH locking script (hex);
   - `allowance`, e.g. 20000;
   - `periodBlocks`, e.g. 1;
   - `fundSatoshis`, e.g. 100000.
   Fund it from the wallet and broadcast. Record the txid.
3. Wait `periodBlocks` confirmations. Then run the follow-up `claimAllowance` on the jar coin with `jarSatoshis` set to the jar value, and broadcast. Record the txid and the invitation JSON.
4. Inspect both in the debug tool. Save the invitation JSON and txids under `docs/proofs/xo-*.json`.

Feedback (~500 words) must be written by Henry personally; the bounty rejects AI-written feedback. `FEEDBACK-NOTES.md` lists only facts observed while building, to jog memory.

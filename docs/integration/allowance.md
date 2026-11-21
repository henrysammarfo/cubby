# UI note: Pocket money jar (SolidCash allowance)

Logic: `src/bounties/allowance.ts`. No new dependencies.

Suggested route: `/jar`. Plain words: "Pocket money jar", not "covenant" or "contract".

1. **Start a jar.** Ask for the child's address, the amount each time, and how often (Daily = 144 blocks, Weekly = 1008).
   - Call `buildJar({ ownerVaultLock: vault.lockingBytecode, childLock, allowance, periodBlocks })`.
   - Show `jar.address` and fund it from the vault with the normal Send flow.
2. **Pay this week's money.** Show this button when the jar coin's confirmations reach `periodBlocks`.
   - `buildClaim(params, jarUtxo)`, then broadcast `hex`. No passkey is needed, and anyone can press it.
   - Use `claimSplit` to preview the amounts.
3. **Top up or close.**
   - `unsignedManage(vaultUtxo, jarUtxo, outputs)` builds the transaction.
   - The passkey signs `manageChallenge(unsigned)`.
   - `attachManage(...)` adds the unlock, then broadcast.
   - Before the passkey prompt, show the outputs in plain words.
4. **Errors to word plainly.** "Too early, try again in N blocks." "The jar is empty."

Store `JarParams` locally (or in Neon if sync is ever needed). The jar address can't be found again without them.

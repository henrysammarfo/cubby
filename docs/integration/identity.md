# UI note: Cubby ID (link your Cubby to a Nostr profile)

Logic: `src/bounties/identity.ts` (`nostr-tools` is already a dependency).

Route: `/id`, linked from Settings.  Plain words: "Link your Nostr profile", "Proof on chain", "Sign in with Cubby ID".

1. **Link.** The user pastes or creates a Nostr key, or uses a NIP-07 extension.
   - Compute `statementOf(claimFor(...))`.
   - The passkey signs it, using `loginPasskeyChallenge` or the same flow as the identity script.
   - `signIdentityEvent(...)` then publishes to the user's relays. Show the relays and ask before publishing.
2. **Proof on chain (optional).** Spend the vault to `anchorOutput(...)` with the normal passkey spend, and show the txid.
3. **Find someone.** Search by npub or vault address with `filterByNostrKey` / `filterByVault`.
   - Keep only `pickVerified` results. Show "Verified" only when `verifyIdentityEvent` passes.
   - Offer "Pay" to the verified vault address.
4. **Sign in.**
   - The server calls `newLoginChallenge()`.
   - The client signs with `signLogin` (and optionally a passkey).
   - The server checks with `verifyLogin`.

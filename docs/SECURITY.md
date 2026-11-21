# Security limits (honest)

These limits apply now and after the deadline, until the code or the approval policy changes.

## Mainnet sending is off

`src/network.ts` sets `allowBroadcast: false` on the main network. `src/chain.ts` `broadcastTransaction` throws if that flag is off. Do not spend mainnet coins until Henry approves the funding address and the exact number of satoshis (the planned amount is 20,000 sats / 0.0002 BCH, with a fee of 11,000 sats).

## The box is bound to one website

`rpIdHash` is fixed in the redeem script (`src/covenant.ts` line 179). A box created at `cubby-liart-six.vercel.app` will not accept an approval from a preview URL or another host. Open the live site to create or spend.

## Other inputs are not signed

The intent hash covers this box’s outpoint and all outputs, not other inputs. The effect is like `SIGHASH_ANYONECANPAY | ALL`: anyone can add inputs (which can only add fee). Each box input needs its own approval over its own outpoint.

## Script size is near the standard limit

Unlocking bytecode sits about 140 to 670 bytes under the 10,000-byte standard limit (`src/unlock.ts`, `MAX_STANDARD_UNLOCKING`). If a signature ever lands over, `UnlockingTooLargeError` is thrown and the app should ask for one more approval (a new signature changes the size). Not seen in 450 test signatures.

## Transaction id malleability

A third party can re-encode the hints or padding of an unconfirmed spend (same effect, new payment id). Do not build unconfirmed chains on top of a box spend until it confirms.

## Locktime

Locktime must be below 2^31 (it must fit a 4-byte script number). That is true for all block heights and for timestamps until 2038. Cubby spends currently use locktime 0 (`src/vault-spend.ts`).

## Empty immutable CashTokens NFTs

`OP_OUTPUTTOKEN*` cannot tell “fungible tokens only” from “fungible tokens plus an immutable NFT with an empty commitment”. Cubby boxes are not meant to hold such NFTs. Documented by a test and in `DOCS_NOTES.md`.

## Device and browser

The automated chipnet proof used a software passkey (`scripts/chipnet-e2e.ts`). A real iPhone Safari Face ID spend on the production origin is still outstanding; see `docs/FACE-ID-TEST.md`. The public key is stored at creation because some browsers do not return it on later visits.

## Prize address

The banner CashTokens address is generated into a gitignored local key file. Henry must move that key to a wallet he controls, or replace the banner with an address he already owns, before the repository is public. Do not print or commit the key.

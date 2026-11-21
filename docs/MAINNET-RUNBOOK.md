# Main network runbook

This is the single path to a real main-network deposit and Face ID spend. **Nothing on the main network has been spent.** The switch stays off until Henry says yes to the exact amount and the funding address.

## The switch

In `src/network.ts`:

```ts
export const MAINNET_SEND_ENABLED = false;
```

Leave it `false` on production. When Henry says yes:

1. Set `MAINNET_SEND_ENABLED` to `true`.
2. Deploy to production (`https://cubby-liart-six.vercel.app` only — the phone lock is tied to that site).
3. Follow the steps below. Do not turn the flag on for a preview URL.

Chipnet sending stays on either way. The flag only unlocks main-network broadcast.

## The amount

Henry sends **exactly 20,000 sats (0.0002 BCH)** to the box, in one payment. That total covers the deposit and the spend fee:

| | Units (sats) |
|---|---:|
| Deposit to the box | 20,000 |
| Network fee for the passkey spend (~10 KB at 1 sat/byte) | 11,000 |
| Amount sent on to the destination | 9,000 |
| **Total Henry spends** | **20,000** |

The app caps a main-network send at 9,000 units and will refuse anything that would go past the 20,000 unit total. Do not send more than 20,000 unless Henry later approves a new amount.

## Where the funding address shows

The address is created on the phone, after the network is switched. It is not written in this file in advance.

1. On the live site, open **Settings**.
2. Turn on **Use the main network**.
3. If this phone already has a test-network box, use a fresh Safari profile (or another browser) so that box is not overwritten. Then **Open the app** and create the box with Face ID.
4. Open **Receive**. The funding address is the large `bitcoincash:p…` address under the code. It also appears at the top of **Settings** as **Box address**.
5. Copy it, or show Henry the Receive screen, and wait for his yes on that exact address plus the 20,000 sats.

## After Henry says yes (and the flag is on)

1. Henry sends exactly 20,000 sats from Paytaca (or another main-network wallet he controls) to the Receive address.
2. Home updates on its own within a few seconds. The balance should read 0.0002 BCH. If it does not, open the address on https://bchexplorer.info and check the deposit.
3. Open **Send**. Paste a `bitcoincash:` address Henry controls. The Max amount should be 0.00009 BCH (9,000 sats). Confirm, then approve Face ID.
4. The success screen shows the payment id and a **View on explorer** link to https://bchexplorer.info/tx/…. Keep both the deposit and spend payment ids.
5. Record those ids in `docs/AUDIT.md` and on the landing page only after they confirm on the explorer.

A real iPhone Face ID spend has not been completed yet. This run is also the Face ID proof. Stay on the live origin. Do not start a second box on a preview link.

## Pocket money jar on the main network

The jar contract and `/allowance` screen already use the selected network (main-network addresses and explorer links). The 20,000 unit approval is for the box send, and that send leaves no change. A main-network jar needs a **separate** approved amount and a second deposit, after the box spend is done. Do not divert the 20,000 sats into a jar.

When that second amount is approved: switch to the main network, open **Pocket money**, create the jar, fund it, then claim. Explorer links will point at bchexplorer.info.

## If something fails

- The send button says the main network stays off: the flag is still `false`, or the deploy has not landed.
- “Capped at 9,000 units”: lower the amount (use Max).
- The box holds less than 20,000: the deposit has not landed, or it was below the approved total. Wait, or top up only with Henry’s yes.
- Face ID is cancelled or the site is a preview URL: read `docs/FACE-ID-TEST.md` and start again on the live site.

## What this runbook does not do

- It does not spend, broadcast, or submit anything.
- It does not change the EMBER address. Henry must supply his own `bitcoincash:z…` address before the banner is swapped.
- It does not make the GitHub repo public.

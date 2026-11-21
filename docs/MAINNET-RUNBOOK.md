# Main network runbook

This is the single path to a real main-network deposit and Face ID spend. Nothing on the main network has been spent yet. Henry approved main-network sending on 21 November 2026, Accra (UTC+0). He will buy and send the Bitcoin Cash himself. The 20,000 unit total and the 9,000 unit per-spend cap stay in force.

## The switch

In `src/network.ts`:

```ts
export const MAINNET_SEND_ENABLED = true;
```

The flag is on in production at https://cubby-liart-six.vercel.app. The phone lock is tied to that site, so do not create a box on a preview URL. Flip the flag back to `false` and redeploy if main-network sends need to be frozen.

Chipnet sending stays on either way. The flag only unlocks main-network broadcast.

Caps that stay in force:

| | Units (sats) |
|---|---:|
| Approved total Henry sends to the box | 20,000 |
| Network fee for the passkey spend (about 10 KB at 1 sat per byte) | 11,000 |
| Largest amount the app will send on to the destination | 9,000 |

The app refuses a main-network send above 9,000 units, and refuses a send that would go past the 20,000 unit total (amount plus fee). Do not send more than 20,000 unless a new amount is agreed first.

## Where the funding address shows

The address is created on the phone, after the network is switched. It is not written in this file in advance.

1. On the live site, open Settings.
2. Turn on Use the main network.
3. If this phone already has a test-network box, use a fresh Safari profile (or another browser) so that box is not overwritten. Then open the app and create the box with Face ID.
4. Open Receive. The funding address is the large `bitcoincash:p…` address under the code. It also appears at the top of Settings as Box address.
5. Copy it, then send the 20,000 sats from Paytaca.

## Broadcast path

A signed send is broadcast in this order: Watchtower (`https://watchtower.cash/api/broadcast/`), then the explorer (`https://bchexplorer.info/api/bch/broadcast`), then the app route `/api/broadcast`, which talks to a main-network Fulcrum server (`bch.imaginary.cash` or `electrum.imaginary.cash`, port 50002).

## Henry’s phone checklist

Do this on your iPhone, on the live site only (https://cubby-liart-six.vercel.app). Do not use a preview link. The phone lock is tied to that exact site.

1. Open Safari and go to https://cubby-liart-six.vercel.app.
2. Open the app, then open Settings, and turn on Use the main network.
3. If this phone already has a test-network box, first open a fresh Safari profile (or another browser) so that box is not overwritten. Then create a new Cubby with Face ID.
4. Open Receive and copy the large bitcoincash:p… address.
5. In Paytaca, send 20,000 sats (0.0002 BCH) to that address. Wait until Cubby home shows 0.0002 BCH.
6. Open Send. Paste your Paytaca plain address bitcoincash:qq7mt4punl9enxeznfrar0xhl6y0p5y5jgktr4yflp. Use Max (9,000 sats). Confirm, then approve Face ID.
7. On the success screen, copy the payment id (the txid). You can also tap View on explorer. Send that payment id, and the deposit payment id if you have it, back in the Cubby chat so we can record them.

A send is capped at 9,000 sats so the 20,000 sat deposit can cover the 11,000 sat network fee. Do not send more than 20,000 sats unless we agree a new amount. The pocket money jar needs a separate deposit later; do not use this 20,000 for a jar.

## After the deposit lands

Home updates on its own within a few seconds. The balance should read 0.0002 BCH. If it does not, open the address on https://bchexplorer.info and check the deposit. After the Face ID send, the success screen shows the payment id and a View on explorer link to https://bchexplorer.info/tx/…. Record both the deposit and spend payment ids in `docs/AUDIT.md` and on the landing page only after they confirm on the explorer.

A real iPhone Face ID spend has not been completed yet. This run is also the Face ID proof. Stay on the live origin.

## Pocket money jar on the main network

The jar contract and `/allowance` screen already use the selected network (main-network addresses and explorer links). The 20,000 unit approval is for the box send, and that send leaves no change. A main-network jar needs a separate approved amount and a second deposit, after the box spend is done. Do not divert the 20,000 sats into a jar.

When that second amount is approved: switch to the main network, open Pocket money, create the jar, fund it, then claim. Explorer links will point at bchexplorer.info.

## If something fails

If the send button says the main network stays off, the flag is still `false`, or the deploy has not landed.

If you see “Capped at 9,000 units”, lower the amount (use Max).

If the box holds less than 20,000, the deposit has not landed, or it was below the approved total. Wait, or top up only after agreeing a new amount.

If Face ID is cancelled or the site is a preview URL, read `docs/FACE-ID-TEST.md` and start again on the live site.

## What this runbook does not do

It does not spend, broadcast, or submit anything on its own.

It does not change the EMBER address. The live banner already uses Henry’s Paytaca CashTokens address `bitcoincash:zq7mt4punl9enxeznfrar0xhl6y0p5y5jg3pst20qj`.

It does not post in Telegram. The Telegram check-in stays held until a real main-network Face ID spend is done.

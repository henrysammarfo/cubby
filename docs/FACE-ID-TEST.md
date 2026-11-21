# Face ID test (about three minutes)

This is the production-origin path for Henry’s iPhone, in Safari — not a software passkey and not a preview URL.

Use only: https://cubby-liart-six.vercel.app

The phone lock is tied to that website address. A preview link or a different host will create a different box, or fail to open this one.

A real iPhone Face ID spend has not been completed yet. This page is the checklist. The in-app copy will not say “Face ID verified” until this run succeeds.

## Before you start

- iPhone, Safari, Face ID (or Touch ID) already set up on the phone.
- Stay on the **test network** (the default). Those coins have no value.
- You will need a small amount of test coins. A send from the box needs about 20 000 test units so the network fee fits.
- If a prompt appears, approve it. If you cancel, the app will say so and will not hang. Tap the button and try again.

## The three-minute path

1. **Open the live site.** In Safari go to https://cubby-liart-six.vercel.app and tap **Open the app**.
2. **Create the box.** Tap **Use my face or fingerprint**. Approve Face ID. You should land on the box screen. If the phone lock is cancelled or times out, you will see a clear message; try again. Do not leave the tab mid-prompt.
3. **Receive test coins.** Open **Receive**. You will see a code and the box address. Tap **Copy address**, or show the code. Tap **Get test coins** (https://tbch.googol.cash/) and send at least 20 000 test units to that address. The balance on the Home screen updates by itself within a few seconds.
4. **Send with Face ID.** Open **Send**. Paste a test-network address you control, enter an amount, tap **Review send**, hold to confirm, then approve Face ID. You should see **Sent**, the payment id, and a link to open the payment. Keep that payment id.

If anything fails, read the message on the screen, come back to this page, and try the same step again. Do not force a second box on a preview URL.

## What “done” looks like

- Home shows a live balance that matches the explorer for your box address.
- Activity lists the deposit and the send, each with **Open this payment**.
- Box details shows this website (`cubby-liart-six.vercel.app`) and does not claim a Face ID check until this run is recorded.
- Send the two payment ids (deposit and spend) back so the docs can be updated. Only then may the app say the iPhone path has been checked.

## If you already created a box on a preview link

Open the original site if you still have it, or create a new box on the live site above. A box cannot be opened from a different website address.

## Automated check (not a real iPhone)

On 21 November 2026, Accra (UTC+0), a Chromium Playwright virtual authenticator (CDP WebAuthn, ctap2, internal transport, user verification required) created a box through the real app UI at http://localhost:4173 (rpId `localhost`). The last box from that run is `bchtest:pwp9y7cd8w00x8v72cvxeztlfckxr5xcwcvp86yn7cslw76nm9su2l0uhvdfc`. The script is `scripts/ui-auth-e2e.ts`.

A fund and spend through the same UI did not complete in this run. The existing test key had no coins. The Apecs faucet returned 502 (Fulcrum websocket error). The Ninja faucet returned payment id `3a1d2fefd26fcba680b690b237d3a466273f03143e881a930f6d2523bc8282ff`, which never appeared on the chipnet explorer (404). The Googol faucet requires a captcha and was not used. Limits were not bypassed.

This is not an iPhone Face ID proof. The existing software-passkey chipnet spend remains `2ac70a7cacf837471ae8997cbf45e620551ecbc1542eced0f0748e9c7973c993`.


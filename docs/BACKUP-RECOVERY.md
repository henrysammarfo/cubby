# Backup wallet ("never stuck")

Plain version: if you lose your phone, your coins are not stuck. When you add a backup wallet (for example your Paytaca address), a coin that sits in the box unused for the time you pick (1 month, 3 months, 6 months or 1 year) can move to that wallet, and only to that wallet. Face ID keeps working the whole time, and every send from the box starts the wait again.

This answers the judges' Final Check-In (21 Nov 2026, about 1:37 to 1:40): "if… you lose your phone… after a certain amount of time it just goes to your paper wallet", and recovery that cannot send money "to the void".

Status: built and tested in the libauth BCH 2026 virtual machine (both paths and every failure case below). It is optional and off by default. Boxes without a backup keep exactly the same script and address as before.

## How it works (for technical judges)

The box is still one P2SH32 script. With a backup set, the redeem script becomes:

```
<the same six OP_DEFINE function definitions>
OP_DUP OP_NOTIF
  OP_DROP
  <delayBlocks> OP_CHECKSEQUENCEVERIFY OP_DROP
  OP_TXINPUTCOUNT OP_1 OP_NUMEQUALVERIFY
  OP_TXOUTPUTCOUNT OP_1 OP_NUMEQUALVERIFY
  OP_0 OP_OUTPUTBYTECODE <backup locking bytecode> OP_EQUALVERIFY
  OP_0 OP_OUTPUTTOKENCATEGORY   OP_0 OP_UTXOTOKENCATEGORY   OP_EQUALVERIFY
  OP_0 OP_OUTPUTTOKENCOMMITMENT OP_0 OP_UTXOTOKENCOMMITMENT OP_EQUALVERIFY
  OP_0 OP_OUTPUTTOKENAMOUNT     OP_0 OP_UTXOTOKENAMOUNT     OP_NUMEQUALVERIFY
  OP_0 OP_OUTPUTVALUE <3000> OP_ADD OP_0 OP_UTXOVALUE OP_GREATERTHANOREQUAL
OP_ELSE
  <the passkey (WebAuthn P-256) path, byte for byte unchanged>
OP_ENDIF
```

Source: `src/covenant.ts` (`recoveryAsm`, `buildRedeemAsm`), spend builder `src/recovery.ts`.

**Branch choice costs the passkey path nothing extra in its unlocking data.** A passkey spend always ends its unlocking data with the hint chunk count, which is at least 1, so `OP_DUP OP_NOTIF` skips the recovery body. A recovery spend pushes one empty item (plus the redeem script), so it enters the recovery body. No selector byte is added to the passkey spend.

What the recovery body enforces:

| Rule | Opcodes | Why |
|---|---|---|
| The coin has not moved for `delayBlocks` blocks | `OP_CHECKSEQUENCEVERIFY` (BIP112) against this input's sequence number, enforced as a relative lock by BIP68 | The owner keeps sole control until the wait is over |
| One input, one output | `OP_TXINPUTCOUNT`, `OP_TXOUTPUTCOUNT` | `OP_0` is then this coin, and nothing can be skimmed into a second output |
| The output pays the backup chosen at setup | `OP_OUTPUTBYTECODE` | Coins can only go to the owner's own wallet, never "to the void" |
| Tokens move unchanged | `OP_OUTPUTTOKEN*` vs `OP_UTXOTOKEN*` | Nobody can burn or change an NFT or fungible amount |
| Fee at most 3,000 units | `OP_OUTPUTVALUE`, `OP_UTXOVALUE` | Nobody can burn the coins as miner fee |

Anyone may broadcast the recovery spend once the wait is over (no key is needed), but the coins can only land in the backup wallet. This is on purpose: a friend, a script, or Cubby itself can push it for you after you lose your phone.

Every send with Face ID makes new coins, so the clock restarts for whatever goes back into the box as change.

### Grounding

- `OP_CHECKSEQUENCEVERIFY` (0xb2): BCH protocol docs, https://documentation.cash/protocol/blockchain/script.html (Locktime table) and BIP112 as carried by BCH, https://documentation.cash/protocol/forks/bip-0112.html. Relative lock format (bit 31 disable, bit 22 type, low 16 bits value): https://documentation.cash/protocol/blockchain/transaction.html. libauth implementation: `node_modules/@bitauth/libauth/build/lib/vm/instruction-sets/common/time.js` (`opCheckSequenceVerify`).
- Native introspection opcodes (`OP_TXINPUTCOUNT`, `OP_TXOUTPUTCOUNT`, `OP_OUTPUTBYTECODE`, `OP_OUTPUTVALUE`, `OP_UTXOVALUE`): CHIP-2021-02 Native Introspection, https://gitlab.com/GeneralProtocols/research/chips/-/blob/master/CHIP-2021-02-Add-Native-Introspection-Opcodes.md
- Token introspection (`OP_UTXOTOKENCATEGORY`, `OP_UTXOTOKENCOMMITMENT`, `OP_UTXOTOKENAMOUNT`, `OP_OUTPUTTOKEN*`): CashTokens CHIP, https://github.com/cashtokens/cashtokens
- The passkey path (unchanged) uses the 2026 CashVM upgrade: loops (`OP_BEGIN`/`OP_UNTIL`) and functions (`OP_DEFINE`/`OP_INVOKE`), https://bchworks.com/upgrades/2026-05-upgrade and https://upgradespecs.bitcoincashnode.org/2026-05-15-upgrade/
- 10,000 byte standard unlocking limit: same 2026 upgrade (P2S CHIP), and `MAX_STANDARD_UNLOCKING` in `src/unlock.ts`.

### What the VM checks and what the node checks

The virtual machine checks that the input's sequence number carries a block based relative lock of at least `delayBlocks` and that the transaction is version 2. The real age of the coin is enforced by full nodes under BIP68: a recovery spend is refused ("non-BIP68-final") until the coin is old enough. The unit tests cover the VM part; the chipnet run below covers the node part.

## Size measurements (the 10,000 byte limit)

Measured with `npx tsx scripts/report.ts <runs> [--backup]`, libauth 3.1.0-next.8, fresh software passkey signatures, 21 Nov 2026.

Redeem script:

| Box | Redeem bytes | Added |
|---|---|---|
| No backup (unchanged) | 1,078 to 1,079 (depends on the key) | 0 |
| Backup to P2PKH, 1 to 6 months | 1,147 | +69 |
| Backup to P2PKH, 1 year | 1,148 | +70 |
| Backup to P2SH32, 1 to 6 months | 1,157 | +79 |
| Backup to P2SH32, 1 year (worst case) | 1,158 | +80 |

Passkey spend unlocking bytes (limit 10,000):

| Box | Variant | Runs | Min | Mean | Max | Over 10,000 | VM failures | Op cost / limit |
|---|---|---|---|---|---|---|---|---|
| No backup | plain clientDataJSON | 500 | 9,206 | 9,551 | 9,754 | 0 | 0 | 0.81 |
| No backup | Chrome's extra clientDataJSON field | 500 | 9,444 | 9,664 | 9,864 | 0 | 0 | 0.80 |
| Backup, worst case (P2SH32, 1 year) | plain | 2,000 | 9,318 | 9,639 | 9,866 | 0 | 0 | 0.80 |
| Backup, worst case (P2SH32, 1 year) | Chrome's extra field | 500 | 9,398 | 9,749 | 9,943 | 0 | 0 | 0.80 |

So the worst measured Face ID spend with a backup is 9,943 bytes, 57 bytes under the limit. If a rare signature ever comes out over 10,000 bytes, the app already refuses it before broadcast (`UnlockingTooLargeError`) and asks for one more Face ID approval, which gives a new signature and a new size. Nothing is ever sent that breaks the limit.

The recovery spend itself is tiny: 1,151 to 1,162 unlocking bytes and a 1,238 to 1,259 byte transaction. At 1 unit per byte that is about 1,260 units of fee, under the 3,000 cap. The app uses 1,500.

The passkey spend with a backup is at most about 10,160 bytes in total, still inside the app's 11,000 unit send fee.

## Tests

`test/recovery.test.ts`, run with `npx vitest run`. All evaluate real transactions in libauth's `createVirtualMachineBch2026`:

- No backup gives the exact same bytecode as before; a backup adds only the body plus 4 control bytes, and the passkey bytes are unchanged.
- Passkey spends verify with a backup set, including before the wait (sequence 0), so the owner is never locked out.
- The recovery spend verifies for a coin with tokens and for a plain coin, and with a longer wait than needed.
- The recovery spend fails: one block early, with the disable flag, with time units instead of blocks, on a version 1 transaction, paying anyone but the backup, with a second output, with a second input, with a fee 1 unit above the cap (and passes at exactly the cap), when tokens are dropped, when the token amount, NFT commitment or NFT capability changes, on a box with no backup, and with a non-empty selector.
- The builder refuses bad fees, dust and boxes with no backup.

The shared test helper (`test/fixtures.ts`, `status`) now also treats a clean stack that holds a false value as a failure, so no test can mistake a false result for a pass.

## In the app

Settings, then "Backup wallet" (`/settings/backup`):

1. Paste a wallet address you own. It gets the same strict checks as Send (checksum, network, type).
2. Pick how long the box must go unused: 1 month, 3 months, 6 months or 1 year.
3. Save with Face ID. Only the owner can change where the backup goes.

Adding, changing or removing a backup gives the box a new address, so the app only allows it while the box is empty. Once the wait is over, "Move coins to backup now" builds and broadcasts the recovery spend for every coin. If it is too early, the node refuses and the app says so in plain words.

**Recovery note.** After saving, the page offers "Copy note" and "Download". The note is one line, `cubby-recovery-v1:<network>/<site>/<passkey public key x>/<y>/<backup address>/<wait in blocks>`, with no secret in it. It is everything needed to rebuild the box script on another device. If the phone is gone, open `/recover` on any device (no phone lock needed), paste the note, check the box and backup it shows, and tap "Move coins to my backup". Encoding and checks: `encodeRecoveryNote` / `decodeRecoveryNote` in `src/recovery.ts`; the move itself: `web/recover.ts`.

## Known limits (honest list)

- The wait counts per coin from when that coin was confirmed. Coins that sit untouched for the whole wait can be moved to the backup by anyone. That is the point of the feature, and the coins still only go to your own wallet.
- The app's coin lookup does not return token details, so "Move coins to backup now" is built for plain BCH coins. A coin holding tokens is still safe: the script refuses any spend that drops the tokens, so the node rejects a wrong build, and nothing is lost.
- Cubby ID (the Nostr identity bounty) derives the box address from the passkey alone, so it names the box without a backup. A box with a backup has a different address.
- The box script needs the passkey public key, which lives on the phone. That is why the recovery note exists: keep it off the phone (email, notes, paper). Without the note, the coins are still safe and still only movable to the backup, but someone has to rebuild the script from the key first.
- The app warns before every change that the box address changes, and blocks the change unless the box is empty.

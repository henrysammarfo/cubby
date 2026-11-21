'use client';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, X } from 'lucide-react';
import { AppShell, BackNav, Sheet, useDemoSuffix } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { Keypad, applyKey } from '@/ui/Keypad';
import { useSession } from '@/lib/client/session';
import { useBalances, usePrice } from '@/lib/client/data';
import { fmtBch, fmtFiat, shortAddr, satsToBch } from '@/lib/client/format';
import { assertNetworkAddress, addressToLocking } from '@/src/address';
import { broadcastTransaction, utxosFromApi } from '@/src/chain';
import { attachPasskeyUnlock, buildUnsignedVaultSpend, challengeForSpend } from '@/src/vault-spend';
import { explainWebAuthnError, requestAssertion, vaultFromStored } from '@/web/passkey';
import { DUST_SATS } from '@/src/network';

function parseBch(value: string): bigint | null {
  const t = value.trim();
  if (!t || t === '.') return null;
  const [w, f = ''] = t.split('.');
  if (f.length > 8) return null;
  try { return BigInt(w || '0') * 100_000_000n + BigInt((f + '00000000').slice(0, 8)); }
  catch { return null; }
}

function SendInner() {
  const s = useSession();
  const router = useRouter();
  const suffix = useDemoSuffix();
  const shot = useSearchParams();
  const { sats } = useBalances(s.address, s.networkId);
  const price = usePrice();
  const [amount, setAmount] = useState(shot.get('sheet') === 'confirm' ? '0.01005741' : '');
  const [dest, setDest] = useState(shot.get('sheet') === 'confirm' ? 'bchtest:qpl93ln6r425c60fqhc25sf4sh59fmwwrufym39tj0' : (shot.get('to') ?? ''));
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState(shot.get('sheet') === 'assets');
  const [confirm, setConfirm] = useState(shot.get('sheet') === 'confirm');
  const [busy, setBusy] = useState(false);
  const fee = s.network.vaultSpendFeeSats;
  const max = sats !== null && sats > fee ? sats - fee : 0n;
  const parsed = useMemo(() => parseBch(amount), [amount]);
  const fiat = parsed !== null && price ? price.usd * satsToBch(parsed) : null;

  const openConfirm = () => {
    setErr(null);
    if (!s.vault && !s.demo) { setErr('Create a box first.'); return; }
    if (!s.network.allowBroadcast) { setErr('Sending on the main network stays off until it is approved.'); return; }
    const d = dest.trim();
    try { assertNetworkAddress(d, s.network); }
    catch (e) { setErr(e instanceof Error ? e.message : 'That address is not valid on this network.'); return; }
    if (parsed === null) { setErr('Enter an amount in BCH, like 0.0001.'); return; }
    if (parsed < DUST_SATS || parsed > max) {
      setErr(`Enter an amount between ${fmtBch(DUST_SATS)} and ${fmtBch(max)} BCH.`);
      return;
    }
    setConfirm(true);
  };

  const onSend = async () => {
    setErr(null); setBusy(true);
    try {
      if (s.demo && !s.vault) {
        setErr('This is a demo box. Create your own box to send for real.');
        setBusy(false);
        return;
      }
      if (!s.vault) throw new Error('Create a box first.');
      if (!s.network.allowBroadcast) throw new Error('Sending on the main network stays off until it is approved.');
      const utxos = await utxosFromApi(s.vault.address, s.network);
      const vaultUtxo = (utxos ?? []).slice().sort((a, b) => (a.satoshis < b.satoshis ? 1 : -1))[0];
      if (!vaultUtxo) throw new Error('The box is empty. Receive coins first.');
      const { params, vault } = vaultFromStored(s.vault);
      const unsigned = buildUnsignedVaultSpend(s.network, vaultUtxo, addressToLocking(dest.trim()), {
        amountSats: parsed!,
        changeLocking: vault.lockingBytecode,
      });
      const assertion = await requestAssertion(s.vault, challengeForSpend(unsigned));
      const signed = attachPasskeyUnlock(vault, params, unsigned, vaultUtxo, assertion);
      const txid = await broadcastTransaction(s.network, signed.hex);
      router.push(`/send/success?txid=${txid}&amount=${String(parsed)}${suffix ? '&demo=1' : ''}`);
    } catch (e) {
      setErr(explainWebAuthnError(e, 'approve'));
    } finally { setBusy(false); }
  };

  return (
    <AppShell screen="send" tab="wallet" noTabs overlay={
      <>
        <Sheet open={pick} onClose={() => setPick(false)} label="Choose an asset">
          <div className="sheet-h"><b>Send</b><button className="nb" type="button" aria-label="Close" onClick={() => setPick(false)}><X size={18} /></button></div>
          <button type="button" className="row" onClick={() => setPick(false)}>
            <span className="logo">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/bitcoin-cash-circle.svg" alt="" /></span>
            <span className="rn"><span className="nm">Bitcoin Cash</span><span className="sb">BCH · {s.network.label}</span></span>
            <span className="px"><span className="p">{sats === null ? '…' : fmtBch(sats)}</span><span className="c">BCH</span></span>
          </button>
        </Sheet>
        <Sheet open={confirm} onClose={() => !busy && setConfirm(false)} label="Confirm this send">
          <div className="sheet-h"><b>Confirm</b><button className="nb" type="button" aria-label="Close" onClick={() => setConfirm(false)}><X size={18} /></button></div>
          <div className="confirm-amt">
            <span className="logo" style={{ width: '3rem', height: '3rem', margin: '0 auto .4rem' }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/bitcoin-cash-circle.svg" alt="" /></span>
            <div className="big">{parsed !== null ? fmtBch(parsed) : '0'} BCH</div>
            {fiat !== null && <p className="hint">{fmtFiat(fiat)}</p>}
          </div>
          <section className="group card">
            <div className="cell"><span>To</span><span className="cv">{dest ? shortAddr(dest) : '—'}</span></div>
            <div className="cell"><span>Network</span><span className="cv">{s.network.label}</span></div>
            <div className="cell"><span>Fee</span><span className="cv">{fee.toLocaleString()} units</span></div>
            <div className="cell"><span>Total</span><span className="cv">{parsed !== null ? `${fmtBch(parsed + fee)} BCH` : '—'}</span></div>
          </section>
          {err && <p className="errline" role="alert">{err}</p>}
          <button className="btn big" type="button" disabled={busy} onClick={() => void onSend()}>Confirm and send</button>
        </Sheet>
      </>
    }>
      <BackNav href={'/wallet'} title="Send" />
      <main className="body">
        <div className="send-to">
          <label htmlFor="dest">To</label>
          <div className="field">
            <input id="dest" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Paste a test network address" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </div>
        </div>
        <div className="amt-card">
          <div>
            <div className="hint" style={{ textAlign: 'left', marginBottom: '.25rem' }}>Amount</div>
            <div className="amt">{amount || '0'}</div>
            {fiat !== null && <div className="hint" style={{ textAlign: 'left' }}>{fmtFiat(fiat)}</div>}
          </div>
          <div className="meta">
            <button type="button" onClick={() => setPick(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontWeight: 650 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/bitcoin-cash-circle.svg" alt="" width={20} height={20} /> BCH <ChevronDown size={14} />
            </button>
            <span>Balance {sats === null ? '…' : fmtBch(sats)} <button className="max" type="button" onClick={() => setAmount(fmtBch(max))}>Max</button></span>
          </div>
        </div>
        {err && !confirm && <p className="errline" role="alert">{err}</p>}
        <Keypad onKey={(k) => setAmount((a) => applyKey(a, k))} />
        <button className="btn big" type="button" onClick={openConfirm}>Continue</button>
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><SendInner /></Gate>; }

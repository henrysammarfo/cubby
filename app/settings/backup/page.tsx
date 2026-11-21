'use client';
import { useEffect, useMemo, useState } from 'react';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { AppShell, BackNav, copy, toast } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { useSession } from '@/lib/client/session';
import { shortAddr } from '@/lib/client/format';
import { checkSendAddress } from '@/src/address-check';
import { utxosFromApi } from '@/src/chain';
import { RECOVERY_MAX_FEE_SATS } from '@/src/covenant';
import { BACKUP_DELAYS, delayLabel, encodeRecoveryNote } from '@/src/recovery';
import { describeMove, moveToBackup } from '@/web/recover';
import { explainWebAuthnError, requestAssertion, setVaultBackup, vaultFromStored } from '@/web/passkey';

function BackupInner() {
  const s = useSession();
  const current = s.vault?.backup ?? null;
  const [dest, setDest] = useState(current?.address ?? '');
  const [delay, setDelay] = useState<number>(current?.delayBlocks ?? BACKUP_DELAYS[1].blocks);
  const [touched, setTouched] = useState(false);
  const [coins, setCoins] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(!current);

  const check = useMemo(() => checkSendAddress(dest, s.network, s.address), [dest, s.network, s.address]);
  const msg = !check.ok && !check.empty && (touched || dest.trim().length >= 20) ? check.reason : null;

  useEffect(() => {
    let live = true;
    if (!s.vault) { setCoins(0); return; }
    setCoins(null);
    void utxosFromApi(s.vault.address, s.network).then((u) => { if (live) setCoins(u === null ? -1 : u.length); });
    return () => { live = false; };
  }, [s.vault, s.network]);

  const empty = coins === 0;
  const canSave = !!s.vault && empty && check.ok && !busy;

  /** Ask for Face ID first, so only the owner can change where the backup goes. */
  const confirmOwner = async () => {
    if (!s.vault) throw new Error('Create your box first.');
    await requestAssertion(s.vault, crypto.getRandomValues(new Uint8Array(32)));
  };

  const save = async () => {
    setErr(null);
    if (!s.vault || !check.ok) return;
    setBusy(true);
    try {
      await confirmOwner();
      setVaultBackup(s.vault, { address: check.address, delayBlocks: delay }, s.network);
      s.refreshVault();
      setEditing(false);
      toast('Backup wallet saved. Your box has a new address.');
    } catch (e) {
      setErr(explainWebAuthnError(e, 'approve'));
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setErr(null);
    if (!s.vault) return;
    setBusy(true);
    try {
      await confirmOwner();
      setVaultBackup(s.vault, null, s.network);
      s.refreshVault();
      setDest('');
      setEditing(true);
      toast('Backup wallet turned off.');
    } catch (e) {
      setErr(explainWebAuthnError(e, 'approve'));
    } finally { setBusy(false); }
  };

  /** Anyone may do this once the wait is over; the coins can only land in the backup wallet. */
  const moveNow = async () => {
    setErr(null);
    if (!s.vault?.backup) return;
    setBusy(true);
    try {
      const { params, vault } = vaultFromStored(s.vault);
      const r = await moveToBackup(s.network, params, vault, s.vault.address);
      const d = describeMove(r, s.vault.backup.delayBlocks);
      if (d.ok) toast(d.ok);
      if (d.wait) setErr(d.wait);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const note = s.vault?.backup
    ? encodeRecoveryNote({
        network: s.network.id,
        rpId: s.vault.rpId,
        publicKeyX: s.vault.publicKeyX,
        publicKeyY: s.vault.publicKeyY,
        backupAddress: s.vault.backup.address,
        delayBlocks: s.vault.backup.delayBlocks,
      })
    : null;

  const downloadNote = () => {
    if (!note) return;
    const text = `Cubby recovery note\n\nIf you lose your phone, open ${location.origin}/recover on any device and paste this line.\nIt holds no secret. It only lets coins move to your backup wallet after the wait.\n\n${note}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'cubby-recovery-note.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <AppShell screen="settings" tab="settings" noTabs>
      <BackNav href="/settings" title="Backup wallet" />
      <main className="body settings backup">
        <div className="backup-hero">
          <span className="mark"><LifeBuoy size={26} aria-hidden /></span>
          <h1>Never stuck</h1>
          <p>Lost your phone? Pick a wallet you already own, like Paytaca. If this box goes unused for the time you choose, your coins can move only to that wallet. Nobody can send them anywhere else.</p>
        </div>

        {current && !editing ? (
          <>
          <section className="group">
            <div className="cell" style={{ alignItems: 'flex-start' }}>
              <span className="lft">
                <span className="logo txt"><ShieldCheck size={18} aria-hidden /></span>
                <span>
                  <span className="ct">Backup is on</span>
                  <span className="cs" style={{ display: 'block', whiteSpace: 'normal' }}>Goes to {shortAddr(current.address, 10, 6)} after {delayLabel(current.delayBlocks)} without use.</span>
                </span>
              </span>
            </div>
            <div className="cell"><span className="ct">Every send from the box</span><span className="cv">Restarts the wait</span></div>
            <div className="cell"><span className="ct">Most it can cost</span><span className="cv">{RECOVERY_MAX_FEE_SATS.toLocaleString()} units</span></div>
          </section>
          <div className="ghead"><b>Recovery note</b></div>
          <section className="group">
            <p className="hint" style={{ padding: '.85rem 0 .4rem', textAlign: 'left' }}>Keep this note somewhere other than this phone, like your email or notes app. If the phone is gone, open {typeof window !== 'undefined' ? window.location.host : 'this site'}/recover on any device and paste it. It holds no secret.</p>
            <div className="pair" style={{ paddingBottom: '.9rem' }}>
              <button className="btn ghost big" type="button" onClick={() => note && void copy(note, 'Recovery note copied')}>Copy note</button>
              <button className="btn ghost big" type="button" onClick={downloadNote}>Download</button>
            </div>
          </section>
          </>
        ) : (
          <>
            <div className="send-to">
              <label htmlFor="backup">Backup wallet address</label>
              <div className="field">
                <input
                  id="backup"
                  value={dest}
                  onChange={(e) => { setDest(e.target.value); setErr(null); }}
                  onBlur={() => setTouched(true)}
                  placeholder={`Paste a ${s.network.label} address you own`}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={msg ? true : undefined}
                  aria-describedby="backup-msg"
                />
              </div>
              <p id="backup-msg" className={msg ? 'errline' : 'hint'} role={msg ? 'alert' : undefined} style={{ textAlign: 'left', minHeight: '1.2rem' }}>
                {msg ?? (check.ok ? 'Address checked.' : 'Copy it from Receive in your other wallet.')}
              </p>
            </div>
            <div className="ghead"><b>Move my coins after</b></div>
            <div className="chips" role="radiogroup" aria-label="Wait before the backup can be used">
              {BACKUP_DELAYS.map((d) => (
                <button key={d.blocks} type="button" role="radio" aria-checked={delay === d.blocks} className={'chip' + (delay === d.blocks ? ' on' : '')} onClick={() => setDelay(d.blocks)}>{d.label}</button>
              ))}
            </div>
            <p className="hint" style={{ textAlign: 'left' }}>of no sends from this box. Each send restarts the wait. You can always spend with Face ID before then.</p>
          </>
        )}

        {s.vault && coins !== null && coins !== 0 && (editing || !current) && (
          <p className="demo-banner" role="note">
            {coins === -1
              ? 'Could not check the box right now. Try again in a moment.'
              : 'Adding or changing a backup gives your box a new address. Send the coins out first, then come back.'}
          </p>
        )}
        {!s.vault && <p className="demo-banner" role="note">Create your box first, then add a backup wallet.</p>}
        {err && <p className="errline" role="alert">{err}</p>}

        {current && !editing ? (
          <div className="stack-btns">
            <button className="btn big" type="button" disabled={busy} onClick={() => void moveNow()}>Move coins to backup now</button>
            <div className="pair">
              <button className="btn ghost big" type="button" disabled={busy || !empty} onClick={() => setEditing(true)}>Change</button>
              <button className="btn ghost big" type="button" disabled={busy || !empty} onClick={() => void turnOff()}>Turn off</button>
            </div>
            <p className="hint">Move now only works after the wait. Changing the backup needs an empty box.</p>
          </div>
        ) : (
          <div className="stack-btns">
            <button className="btn big" type="button" disabled={!canSave} onClick={() => void save()}>{busy ? 'Confirm with Face ID…' : 'Save with Face ID'}</button>
            {current && <button className="btn ghost big" type="button" disabled={busy} onClick={() => { setEditing(false); setDest(current.address); setDelay(current.delayBlocks); }}>Cancel</button>}
          </div>
        )}
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><BackupInner /></Gate>; }

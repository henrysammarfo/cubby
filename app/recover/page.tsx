'use client';
import { useMemo, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { AppShell, BackNav, toast } from '@/ui/kit';
import { shortAddr } from '@/lib/client/format';
import { checkSendAddress } from '@/src/address-check';
import { decodeRecoveryNote, delayLabel } from '@/src/recovery';
import { boxFromNote, describeMove, moveToBackup } from '@/web/recover';

/** Open to everyone, no phone lock needed: paste a recovery note and move the coins to the backup wallet. */
export default function RecoverPage() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const note = decodeRecoveryNote(text);
    if (typeof note === 'string') return { error: note } as const;
    try {
      const box = boxFromNote(note);
      const backup = checkSendAddress(note.backupAddress, box.network);
      if (!backup.ok) return { error: `The backup address in this note is not valid: ${backup.reason}` } as const;
      return { note, box } as const;
    } catch {
      return { error: 'This recovery note could not rebuild a box. Paste the whole note.' } as const;
    }
  }, [text]);

  const move = async () => {
    if (!parsed || 'error' in parsed) return;
    setErr(null); setBusy(true);
    try {
      const r = await moveToBackup(parsed.box.network, parsed.box.params, parsed.box.vault, parsed.box.address);
      const d = describeMove(r, parsed.note.delayBlocks);
      if (d.ok) { toast(d.ok); setDone(r.moved); }
      if (d.wait) setErr(d.wait);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <AppShell screen="settings" tab="settings" noTabs>
      <BackNav href="/" title="Recover" />
      <main className="body settings backup">
        <div className="backup-hero">
          <span className="mark"><LifeBuoy size={26} aria-hidden /></span>
          <h1>Lost your phone?</h1>
          <p>Paste the recovery note you saved. Once the box has gone unused for the wait you picked, its coins move to your backup wallet. They cannot go anywhere else.</p>
        </div>
        <div className="send-to">
          <label htmlFor="note">Recovery note</label>
          <textarea id="note" className="note-box" rows={4} value={text} onChange={(e) => { setText(e.target.value); setErr(null); setDone([]); }} placeholder="cubby-recovery-v1:…" autoCapitalize="off" autoComplete="off" spellCheck={false} />
          {parsed && 'error' in parsed && <p className="errline" role="alert">{parsed.error}</p>}
        </div>
        {parsed && !('error' in parsed) && (
          <section className="group">
            <div className="cell"><span className="ct">Box</span><span className="cv">{shortAddr(parsed.box.address)}</span></div>
            <div className="cell"><span className="ct">Goes to</span><span className="cv">{shortAddr(parsed.note.backupAddress)}</span></div>
            <div className="cell"><span className="ct">After</span><span className="cv">{delayLabel(parsed.note.delayBlocks)} unused</span></div>
            <div className="cell"><span className="ct">Network</span><span className="cv">{parsed.box.network.label}</span></div>
          </section>
        )}
        {err && <p className="errline" role="alert">{err}</p>}
        {done.length > 0 && (
          <p className="hint" style={{ textAlign: 'left' }}>
            Sent. {done.map((t) => <a key={t} href={parsed && !('error' in parsed) ? parsed.box.network.explorerTx.replace('{txid}', t) : '#'} target="_blank" rel="noreferrer" style={{ display: 'block', overflowWrap: 'anywhere' }}>{t}</a>)}
          </p>
        )}
        <button className="btn big" type="button" disabled={busy || !parsed || 'error' in parsed} onClick={() => void move()}>{busy ? 'Moving…' : 'Move coins to my backup'}</button>
      </main>
    </AppShell>
  );
}

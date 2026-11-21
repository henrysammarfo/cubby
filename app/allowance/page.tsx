'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, PiggyBank } from 'lucide-react';
import { AppShell, BackNav, Sheet, copy, useDemoSuffix } from '@/ui/kit';
import { Gate } from '@/ui/Gate';
import { useSession } from '@/lib/client/session';
import { ALLOWANCE_PROOF, periodLabel } from '@/lib/proofs';
import { explorerUrl, fmtBch, shortAddr } from '@/lib/client/format';
import { addressToLocking, lockingToAddress } from '@/src/address';
import { checkSendAddress } from '@/src/address-check';
import { attachManage, buildClaim, buildJar, unsignedManage, manageChallenge } from '@/src/bounties/allowance';
import { broadcastTransaction, utxosFromApi } from '@/src/chain';
import { explainWebAuthnError, requestAssertion, vaultFromStored } from '@/web/passkey';
import { DUST_SATS } from '@/src/network';

const JAR_KEY = 'cubby-jar-v1';
const DAILY = 144n;
const WEEKLY = 1008n;

type StoredJar = {
  childAddress: string;
  allowance: string;
  periodBlocks: string;
  jarAddress: string;
};

const loadJar = (): StoredJar | null => {
  try {
    const raw = localStorage.getItem(JAR_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as StoredJar;
    if (!j.jarAddress || !j.childAddress) return null;
    return j;
  } catch { return null; }
};

const saveJar = (j: StoredJar) => localStorage.setItem(JAR_KEY, JSON.stringify(j));

function AllowanceInner() {
  const s = useSession();
  const router = useRouter();
  const suffix = useDemoSuffix();
  const shot = useSearchParams();
  const demo = s.demo || shot.get('demo') === '1' || shot.get('shot') === '1';
  const wantNew = shot.get('new') === '1' && !demo;
  const [stored, setStored] = useState<StoredJar | null>(null);
  const [child, setChild] = useState('');
  const [allowance, setAllowance] = useState('20000');
  const [period, setPeriod] = useState<bigint>(DAILY);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topUp, setTopUp] = useState('');
  const [confirmTop, setConfirmTop] = useState(false);
  const [claimNote, setClaimNote] = useState<string | null>(null);

  useEffect(() => { setStored(loadJar()); }, []);

  const view = useMemo(() => {
    if (demo) {
      return {
        demo: true,
        childAddress: ALLOWANCE_PROOF.childAddress,
        jarAddress: ALLOWANCE_PROOF.jarAddress,
        allowance: BigInt(ALLOWANCE_PROOF.params.allowance),
        periodBlocks: BigInt(ALLOWANCE_PROOF.params.periodBlocks),
        owner: ALLOWANCE_PROOF.vaultAddress,
        history: [
          { title: 'Filled the jar', txid: ALLOWANCE_PROOF.fund },
          { title: 'Top up with phone lock', txid: ALLOWANCE_PROOF.manage },
          { title: 'Paid to the child', txid: ALLOWANCE_PROOF.claim },
        ],
      };
    }
    if (stored) {
      return {
        demo: false,
        childAddress: stored.childAddress,
        jarAddress: stored.jarAddress,
        allowance: BigInt(stored.allowance),
        periodBlocks: BigInt(stored.periodBlocks),
        owner: s.address,
        history: [] as { title: string; txid: string }[],
      };
    }
    return null;
  }, [demo, stored, s.address]);

  const creating = !view || wantNew;

  const onCreate = () => {
    setErr(null);
    if (!s.vault || !s.address) { setErr('Create your box first, then start a jar.'); return; }
    try {
      const childCheck = checkSendAddress(child, s.network, s.address);
      if (!childCheck.ok) { setErr(childCheck.reason); return; }
      const amount = BigInt(allowance.replace(/\\s/g, '') || '0');
      const jar = buildJar({
        ownerVaultLock: addressToLocking(s.address),
        childLock: childCheck.lockingBytecode,
        allowance: amount,
        periodBlocks: period,
      });
      const jarAddress = lockingToAddress(jar.lockingBytecode, s.network);
      const rec: StoredJar = { childAddress: child.trim(), allowance: String(amount), periodBlocks: String(period), jarAddress };
      saveJar(rec);
      setStored(rec);
      router.replace('/allowance' + suffix);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const onClaim = async () => {
    setErr(null); setClaimNote(null); setBusy(true);
    try {
      if (demo) {
        setClaimNote('This demo jar has already paid. The claim is on the test network below.');
        return;
      }
      if (!view) return;
      const utxos = await utxosFromApi(view.jarAddress, s.network);
      const jarUtxo = (utxos ?? []).slice().sort((a, b) => (a.satoshis < b.satoshis ? 1 : -1))[0];
      if (!jarUtxo) throw new Error('The jar is empty.');
      const built = buildClaim({
        ownerVaultLock: addressToLocking(s.address!),
        childLock: addressToLocking(view.childAddress),
        allowance: view.allowance,
        periodBlocks: view.periodBlocks,
      }, jarUtxo);
      const txid = await broadcastTransaction(s.network, built.hex);
      setClaimNote('Paid. Open the payment on the explorer (' + txid.slice(0, 10) + '…).');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/too early|age|sequence/i.test(msg)) setErr('Too early. Try again after the waiting period.');
      else setErr(msg);
    } finally { setBusy(false); }
  };

  const onTopUp = async () => {
    setErr(null); setBusy(true);
    try {
      if (demo) { setClaimNote('This demo already had a top up on the test network. See the payment below.'); setConfirmTop(false); return; }
      if (!s.vault || !view || !s.address) throw new Error('Open your box first.');
      const add = BigInt(topUp.replace(/\\s/g, '') || '0');
      if (add <= 0n) throw new Error('Enter how many units to add.');
      const [vaultUtxos, jarUtxos] = await Promise.all([
        utxosFromApi(s.address, s.network),
        utxosFromApi(view.jarAddress, s.network),
      ]);
      const vaultUtxo = (vaultUtxos ?? []).slice().sort((a, b) => (a.satoshis < b.satoshis ? 1 : -1))[0];
      const jarUtxo = (jarUtxos ?? []).slice().sort((a, b) => (a.satoshis < b.satoshis ? 1 : -1))[0];
      if (!vaultUtxo) throw new Error('Your box is empty. Receive coins first.');
      if (!jarUtxo) throw new Error('Send coins to the jar first, then you can top it up.');
      const fee = s.network.vaultSpendFeeSats;
      const totalIn = vaultUtxo.satoshis + jarUtxo.satoshis;
      const jarOut = jarUtxo.satoshis + add;
      const vaultOut = totalIn - jarOut - fee;
      if (vaultOut < 0n) throw new Error('Not enough coins in the box to add that much, after the network fee.');
      const jarLock = addressToLocking(view.jarAddress);
      const vaultLock = addressToLocking(s.address);
      const outputs = [{ lockingBytecode: jarLock, valueSatoshis: jarOut }];
      if (vaultOut >= DUST_SATS) outputs.push({ lockingBytecode: vaultLock, valueSatoshis: vaultOut });
      else if (vaultOut !== 0n) throw new Error('The leftover in your box would be too small. Add a different amount.');
      const unsigned = unsignedManage(vaultUtxo, jarUtxo, outputs);
      const { params, vault } = vaultFromStored(s.vault);
      const assertion = await requestAssertion(s.vault, manageChallenge(unsigned));
      const signed = attachManage(vault, params, {
        ownerVaultLock: vaultLock,
        childLock: addressToLocking(view.childAddress),
        allowance: view.allowance,
        periodBlocks: view.periodBlocks,
      }, unsigned, vaultUtxo, jarUtxo, assertion);
      const txid = await broadcastTransaction(s.network, signed.hex);
      setConfirmTop(false);
      setClaimNote('Top up sent. Open the payment on the explorer (' + txid.slice(0, 10) + '…).');
    } catch (e) {
      setErr(explainWebAuthnError(e, 'approve'));
    } finally { setBusy(false); }
  };

  return (
    <AppShell screen="allowance" tab="wallet" noTabs overlay={
      <Sheet open={confirmTop} onClose={() => !busy && setConfirmTop(false)} label="Top up this jar">
        <div className="sheet-h"><b>Top up</b></div>
        <p className="hint" style={{ textAlign: 'left' }}>Add coins from your box to the jar. Your face or fingerprint approves it.</p>
        <div className="field">
          <input value={topUp} onChange={(e) => setTopUp(e.target.value)} inputMode="numeric" placeholder="Units to add" />
        </div>
        {err && <p className="errline" role="alert">{err}</p>}
        <button className="btn big" type="button" disabled={busy} onClick={() => void onTopUp()}>Confirm and add</button>
        <button className="btn text" type="button" onClick={() => setConfirmTop(false)}>Cancel</button>
      </Sheet>
    }>
      <BackNav href={'/wallet'} title="Pocket money jar" />
      <main className="body">
        {demo && (
          <div className="demo-banner">Demo jar. These are real test network payments from the SolidCash proof, not a jar on this phone.</div>
        )}

        {creating && !demo && (
          <>
            <p className="hint" style={{ textAlign: 'left' }}>Start a jar for someone you trust. They can pull a set amount after each wait. Only your box can change or close it.</p>
            <div className="send-to">
              <label htmlFor="child">Child&apos;s address</label>
              <div className="field">
                <input id="child" value={child} onChange={(e) => setChild(e.target.value)} placeholder="Paste a test network address" autoComplete="off" autoCapitalize="off" spellCheck={false} />
              </div>
            </div>
            <div className="send-to">
              <label htmlFor="allow">Amount each time (units)</label>
              <div className="field">
                <input id="allow" value={allowance} onChange={(e) => setAllowance(e.target.value)} inputMode="numeric" />
              </div>
            </div>
            <div>
              <div className="hint" style={{ textAlign: 'left', marginBottom: '.4rem' }}>How often</div>
              <div className="period">
                <button type="button" className={'chip' + (period === DAILY ? ' on' : '')} onClick={() => setPeriod(DAILY)}>Every day</button>
                <button type="button" className={'chip' + (period === WEEKLY ? ' on' : '')} onClick={() => setPeriod(WEEKLY)}>Every week</button>
              </div>
            </div>
            {err && <p className="errline" role="alert">{err}</p>}
            <button className="btn big" type="button" onClick={onCreate}>Start this jar</button>
          </>
        )}

        {view && !wantNew && (
          <>
            <section className="jar-card" aria-label="Pocket money jar">
              <span className="mark"><PiggyBank size={22} aria-hidden /></span>
              <span className="rn">
                <span className="nm">Pocket money jar</span>
                <span className="sb">{fmtBch(view.allowance)} BCH each time · {periodLabel(view.periodBlocks)}</span>
              </span>
            </section>
            <section className="group card">
              <div className="cell"><span>Jar address</span><button className="btn text" type="button" onClick={() => void copy(view.jarAddress, 'Address copied')}>Copy</button></div>
              <p className="hint" style={{ textAlign: 'left', padding: '0 0 .7rem', overflowWrap: 'anywhere' }}>{view.jarAddress}</p>
              <div className="cell"><span>Pays to</span><span className="cv">{shortAddr(view.childAddress, 6, 4)}</span></div>
              <div className="cell"><span>Next payment</span><span className="cv">{demo ? 'Already paid in this demo' : 'After the waiting period'}</span></div>
            </section>
            {err && <p className="errline" role="alert">{err}</p>}
            {claimNote && <p className="hint" style={{ textAlign: 'left' }}>{claimNote}</p>}
            <button className="btn big" type="button" disabled={busy} onClick={() => void onClaim()}>Pay this pocket money</button>
            <button className="btn ghost big" type="button" onClick={() => { setErr(null); setConfirmTop(true); }}>Top up with your face or fingerprint</button>
            {!demo && (
              <Link className="btn text" href={'/send' + (suffix ? suffix + '&to=' + encodeURIComponent(view.jarAddress) : '?to=' + encodeURIComponent(view.jarAddress))}>Send coins to the jar</Link>
            )}

            <div className="ghead"><b>History</b></div>
            {view.history.length === 0 ? (
              <p className="hint" style={{ textAlign: 'left' }}>Payments show up here once the jar is used.</p>
            ) : (
              <section>
                {view.history.map((h) => (
                  <a key={h.txid} className="row w-chev" href={explorerUrl(s.networkId, h.txid)} target="_blank" rel="noreferrer">
                    <span className="logo txt"><PiggyBank size={18} aria-hidden /></span>
                    <span className="rn"><span className="nm">{h.title}</span><span className="sb">{h.txid.slice(0, 10)}…{h.txid.slice(-6)}</span></span>
                    <span className="chev2"><ChevronRight size={16} aria-hidden /></span>
                  </a>
                ))}
              </section>
            )}
            <p className="hint" style={{ textAlign: 'left' }}>The same jar can be opened in an XO wallet.</p>
            <a className="btn text" href="https://blaze.xo.cash" target="_blank" rel="noreferrer">Open this jar in an XO wallet</a>
          </>
        )}
      </main>
    </AppShell>
  );
}
export default function Page() { return <Gate><AllowanceInner /></Gate>; }

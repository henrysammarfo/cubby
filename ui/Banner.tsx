'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { DECK_HREF, EMBER_TOKEN_ADDRESS, REPO_URL } from '@/src/banner';
import { copy } from './kit';

const FULL_ON = new Set(['/', '/film']);

function CopyEmber({ compact = false }: { compact?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <button
      className={'copy press' + (on ? ' is-on' : '')}
      type="button"
      aria-label="Copy the EMBER vote address"
      aria-describedby="emberAddress"
      onClick={async () => { await copy(EMBER_TOKEN_ADDRESS, 'Address copied'); setOn(true); setTimeout(() => setOn(false), 1600); }}
    >
      <span className="lab">{compact ? 'Copy' : 'Copy'}</span>
      <span className="done" aria-hidden="true">Copied</span>
    </button>
  );
}

export function BlazeBanner() {
  const path = usePathname() || '/';
  const q = useSearchParams();
  const suffix = q.get('demo') === '1' || q.get('shot') === '1' ? '?demo=1' : '';
  const full = FULL_ON.has(path);

  if (!full) {
    return (
      <div className="blaze slim" role="region" aria-label="BLAZE 2026 entry">
        <span className="pill">BLAZE 2026</span>
        <span className="ember-line">
          <span id="emberAddress" className="vote" title={EMBER_TOKEN_ADDRESS}>Vote EMBER</span>
          <code className="addr">{EMBER_TOKEN_ADDRESS.replace('bitcoincash:', 'bitcoincash:').slice(0, 22)}…</code>
        </span>
        <CopyEmber compact />
        <Link className="more" href={'/settings' + suffix + '#about'}>About</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="blaze" role="region" aria-label="BLAZE 2026 entry">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="mark"><img src="/logo/cubby.svg" alt="" width={22} height={22} /><span className="pill">BLAZE 2026 ENTRY</span></span>
        <Link className="stub" href={DECK_HREF}>
          <b>Widget Factory intro</b>
          <span className="meta">8-slide intro on this site</span>
        </Link>
        <a className="stub" href={REPO_URL} target="_blank" rel="noreferrer">
          <b>Source code</b>
          <span className="meta">henrysammarfo/cubby</span>
        </a>
        <div className="ember-stub">
          <span style={{ minWidth: 0 }}>
            <b>Vote with EMBER 2026</b>
            <code className="addr" id="emberAddress" title={EMBER_TOKEN_ADDRESS}>{EMBER_TOKEN_ADDRESS}</code>
          </span>
          <CopyEmber />
        </div>
      </div>
      <p className="blaze-note">Built fresh during BLAZE, first commit <a href={REPO_URL + '/commit/18c652e'} target="_blank" rel="noreferrer">17 Nov</a>.</p>
    </div>
  );
}

export { DECK_HREF, EMBER_TOKEN_ADDRESS, REPO_URL };

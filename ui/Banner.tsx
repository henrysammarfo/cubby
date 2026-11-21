'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Copy, Flame, Github, Presentation } from 'lucide-react';
import { DECK_HREF, EMBER_TOKEN_ADDRESS, REPO_URL } from '@/src/banner';
import { copy } from './kit';

const FULL_ON = new Set(['/', '/film']);
const bare = EMBER_TOKEN_ADDRESS.replace('bitcoincash:', '');
const SHORT = `${bare.slice(0, 4)}…${bare.slice(-4)}`;

/**
 * BLAZE 2026 entry strip. One row on every screen size: intro deck, source code,
 * and the EMBER vote address with copy. Phones show a short address; wider
 * screens show it in full. The strip owns the iPhone safe area at the top.
 */
export function BlazeBanner() {
  const path = usePathname() || '/';
  const full = FULL_ON.has(path);
  const [done, setDone] = useState(false);

  return (
    <div className={'bz' + (full ? ' bz-full' : '')} role="region" aria-label="BLAZE 2026 entry">
      <div className="bz-in">
        <span className="bz-tag"><Flame size={13} aria-hidden strokeWidth={2.4} />BLAZE 2026</span>
        <Link className="bz-link" href={DECK_HREF}>
          <Presentation size={14} aria-hidden />
          <span className="bz-s">Deck</span><span className="bz-l">Intro deck</span>
        </Link>
        <a className="bz-link" href={REPO_URL} target="_blank" rel="noreferrer">
          <Github size={14} aria-hidden />
          <span className="bz-s">Code</span><span className="bz-l">Source code</span>
          <span className="sr"> (opens in a new tab)</span>
        </a>
        <button
          type="button"
          className={'bz-vote press' + (done ? ' is-on' : '')}
          title={EMBER_TOKEN_ADDRESS}
          aria-label={`Copy the EMBER vote address ${EMBER_TOKEN_ADDRESS}`}
          onClick={async () => { await copy(EMBER_TOKEN_ADDRESS, 'Vote address copied'); setDone(true); setTimeout(() => setDone(false), 1600); }}
        >
          <span className="bz-vlab">Vote<span className="bz-l"> with EMBER</span></span>
          <code id="emberAddress" className="bz-addr">
            <span className="bz-s">{SHORT}</span>
            <span className="bz-l">{EMBER_TOKEN_ADDRESS}</span>
          </code>
          <span className="bz-ico" aria-hidden>{done ? <Check size={14} strokeWidth={3} /> : <Copy size={14} />}</span>
        </button>
        {full ? (
          <span className="bz-note">
            Built fresh during BLAZE, first commit <a href={REPO_URL + '/commit/18c652e'} target="_blank" rel="noreferrer">17 Nov</a>
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { DECK_HREF, EMBER_TOKEN_ADDRESS, REPO_URL };

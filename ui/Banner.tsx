'use client';
import { useState } from 'react';
import { EMBER_TOKEN_ADDRESS } from '@/src/banner';
import { copy } from './kit';

const WIDGET = 'https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit?usp=sharing';
const REPO = 'https://github.com/henrysammarfo/cubby';

export function BlazeBanner() {
  const [on, setOn] = useState(false);
  return (
    <div>
      <div className="blaze" role="region" aria-label="BLAZE 2026 entry">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="mark"><img src="/logo/cubby.svg" alt="" width={22} height={22} /><span className="pill">BLAZE 2026 ENTRY</span></span>
        <a className="stub" href={WIDGET} target="_blank" rel="noreferrer">
          <b>Widget Factory intro</b>
          <span className="meta">Our intro deck</span>
        </a>
        <a className="stub" href={REPO} target="_blank" rel="noreferrer">
          <b>Source code</b>
          <span className="meta">henrysammarfo/cubby</span>
        </a>
        <div className="ember-stub">
          <span style={{ minWidth: 0 }}>
            <b>Vote with EMBER 2026</b>
            <code className="addr" id="emberAddress" title={EMBER_TOKEN_ADDRESS}>{EMBER_TOKEN_ADDRESS}</code>
          </span>
          <button className={'copy press' + (on ? ' is-on' : '')} type="button" aria-describedby="emberAddress" onClick={async () => { await copy(EMBER_TOKEN_ADDRESS, 'Address copied'); setOn(true); setTimeout(() => setOn(false), 1600); }}>
            <span className="lab">Copy</span>
            <span className="done" aria-hidden="true">Copied</span>
          </button>
        </div>
      </div>
      <p className="blaze-note">Built fresh during BLAZE, first commit <a href={REPO + '/commit/18c652e'} target="_blank" rel="noreferrer">17 Nov</a>.</p>
    </div>
  );
}

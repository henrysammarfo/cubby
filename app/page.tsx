import Link from 'next/link';
import { BadgeCheck, Fingerprint } from 'lucide-react';
import './landing.css';
import { FilmPlayer } from '@/ui/Film';

export default function Landing() {
  return (
    <div className="lp" id="top">
      <header className="lp-nav">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/cubby.svg" alt="" width={24} height={24} />
          <span>Cubby</span>
        </Link>
        <nav>
          <a href="#how">How it works</a>
          <a href="#film">The film</a>
          <Link href="/how-it-works">Guide</Link>
        </nav>
        <Link className="btn" href="/welcome">Open the app</Link>
      </header>

      <section className="lp-hero">
        <div>
          <span className="lp-pill"><span className="dot" />A test-network proof you can open now</span>
          <h1>A box only your face can open.</h1>
          <p className="lp-lead">Lock Bitcoin Cash with Face ID or your fingerprint. The chain checks the approval itself. No seed phrase to write down.</p>
          <div className="lp-ctas">
            <Link className="btn big" href="/wallet?demo=1">Try the demo</Link>
            <Link className="btn ghost big" href="/welcome">Open the app</Link>
          </div>
          <ul className="lp-trust">
            <li><BadgeCheck size={16} aria-hidden />No seed phrase</li>
            <li><Fingerprint size={16} aria-hidden />Your face or fingerprint</li>
            <li><BadgeCheck size={16} aria-hidden />The chain does the check</li>
          </ul>
        </div>
        <div className="lp-hero-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mascot" src="/mascot/cubby-hero-1280.jpg" alt="Cubby, a small orange character with a lock" />
          <div className="float f1"><Fingerprint size={16} />Only you can open it</div>
          <div className="float f2"><BadgeCheck size={16} />Checked on the chain</div>
        </div>
      </section>

      <section className="lp-how" id="how">
        <h2>Three steps. One of them is you.</h2>
        <ol className="lp-how-steps">
          <li><span className="n">01</span><div><b>Create your box</b><span>Use your face or fingerprint on this website. The box address is yours.</span></div></li>
          <li><span className="n">02</span><div><b>Receive coins</b><span>Share the code, or connect a wallet you already use, and send test coins in.</span></div></li>
          <li><span className="n">03</span><div><b>Send with your face</b><span>Review the payment, then approve with your face or fingerprint.</span></div></li>
        </ol>
      </section>

      <section className="lp-film" id="film">
        <h2>Watch the 20 second film.</h2>
        <div className="film">
          <FilmPlayer />
        </div>
        <p className="film-alt"><Link href="/film">Open the film on its own page</Link></p>
      </section>

      <section className="lp-band">
        <h2>Try it on the test network.</h2>
        <p>Test coins have no value. On the main network a send is capped at 9 000 units, so a 20 000 unit deposit covers the fee.</p>
        <div className="lp-ctas">
          <Link className="btn big" href="/wallet?demo=1">Try the demo</Link>
          <Link className="btn ghost big" href="/welcome">Open the app</Link>
        </div>
      </section>

      <footer className="ft">
        <div className="ft-in">
          <div>
            <Link href="/" className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo/cubby.svg" alt="" width={22} height={22} />
              <span>Cubby</span>
            </Link>
            <p style={{ marginTop: '.75rem' }}>Built fresh during BLAZE 2026. First commit 17 Nov.</p>
          </div>
          <nav>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/welcome">Open the app</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="https://github.com/henrysammarfo/cubby" target="_blank" rel="noreferrer">Source</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

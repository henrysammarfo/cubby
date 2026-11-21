import Link from 'next/link';
import { Fingerprint, KeyRound, Play, ShieldCheck } from 'lucide-react';
import './landing.css';
import { FilmPlayer } from '@/ui/Film';
import { HoldCard } from '@/ui/landing/HoldCard';

export default function Landing() {
  return (
    <div className="lp" id="top">
      <div className="hx">
        <header className="lp-nav hx-nav">
          <Link href="/" className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/cubby.svg" alt="" width={26} height={26} />
            <span>Cubby</span>
          </Link>
          <nav>
            <a href="#how">How it works</a>
            <a href="#film">The film</a>
            <Link href="/how-it-works">Guide</Link>
          </nav>
          <Link className="hx-open" href="/welcome">Open the app</Link>
        </header>

        <section className="hx-hero" aria-labelledby="heroTitle">
          <div className="hx-copy">
            <span className="hx-pill"><span className="dot" />Bitcoin Cash wallet with no seed phrase</span>
            <h1 id="heroTitle">Your <em>face</em> is the key.</h1>
            <p className="hx-lead">Cubby is a Bitcoin Cash wallet you open with Face ID. There are no secret words to write down, and the Bitcoin Cash network itself checks it is really you before any coins move.</p>
            <div className="hx-ctas">
              <Link className="hx-try press" href="/wallet?demo=1">Try it now</Link>
              <a className="hx-film press" href="#film"><span className="hx-play"><Play size={14} fill="currentColor" aria-hidden /></span>Watch the film</a>
            </div>
            <p className="hx-small">No sign up and no coins needed. It takes two minutes.</p>
          </div>
          <div className="hx-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="hx-mascot"
              src="/mascot/cubby-hero-1280.jpg"
              srcSet="/mascot/cubby-hero-1280.jpg 1280w, /mascot/cubby-hero-2048.jpg 2048w"
              sizes="(max-width: 960px) 100vw, 50vw"
              width={1280}
              height={960}
              alt="Cubby, our vault keeper, holds up a phone showing a face scan"
            />
            <div className="hx-card"><HoldCard /></div>
          </div>
        </section>

        <ul className="hx-trust" aria-label="Why Cubby">
          <li><KeyRound size={16} aria-hidden />No seed phrase</li>
          <li><Fingerprint size={16} aria-hidden />Face ID or fingerprint</li>
          <li><ShieldCheck size={16} aria-hidden />Checked by the network</li>
        </ul>
      </div>

      <section className="lp-how" id="how">
        <h2>Three steps. One of them is you.</h2>
        <ol className="lp-how-steps">
          <li><span className="n">01</span><div><b>Create your Cubby</b><span>Use Face ID or your fingerprint on this website. The wallet address is yours alone.</span></div></li>
          <li><span className="n">02</span><div><b>Add coins</b><span>Show the code, or connect Paytaca, Selene or Cashonize, and send Bitcoin Cash in.</span></div></li>
          <li><span className="n">03</span><div><b>Send with your face</b><span>Check the payment, then approve it with Face ID. The network checks your face approval before anything moves.</span></div></li>
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
        <h2>See it work in two minutes.</h2>
        <p>The demo replays a real Cubby on the test network, from the deposit to the Face ID payment. When you are ready, create your own with Face ID.</p>
        <div className="lp-ctas">
          <Link className="btn big" href="/wallet?demo=1">Try it now</Link>
          <Link className="btn ghost big" href="/welcome">Create my Cubby</Link>
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
            <Link href="/deck">Intro deck</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="https://github.com/henrysammarfo/cubby" target="_blank" rel="noreferrer">Source</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

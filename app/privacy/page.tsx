import Link from 'next/link';
import '../landing.css';

export default function Privacy() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logo/cubby.svg" alt="" width={24} height={24} /><span>Cubby</span></Link>
        <Link className="btn" href="/welcome">Open the app</Link>
      </header>
      <article className="lp-doc">
        <h1>Privacy</h1>
        <p className="upd">Last updated 21 November 2026, Accra (UTC+0).</p>
        <p>Your phone lock stays on your device. Cubby does not receive your face, fingerprint, or a seed phrase.</p>
        <p>The box address, public key, and credential id are stored in this browser, on this device. Payments you send or receive are public on the Bitcoin Cash network, like any other payment.</p>
        <p>If you connect a wallet, that session uses WizardConnect and the relay at relay.riften.net. Balance and payment lists are fetched from public test network or explorer services.</p>
        <p>Bitcoin Cash prices, when shown, come from CoinGecko. If that request fails, no price is shown.</p>
        <p><Link href="/">Back to the start</Link> · <Link href="/terms">Terms</Link></p>
      </article>
    </div>
  );
}

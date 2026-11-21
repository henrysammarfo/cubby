import Link from 'next/link';
import '../landing.css';

export default function Terms() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logo/cubby.svg" alt="" width={24} height={24} /><span>Cubby</span></Link>
        <Link className="btn" href="/welcome">Open the app</Link>
      </header>
      <article className="lp-doc">
        <nav className="doc-links">
          <Link href="/how-it-works">Guide</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <p className="upd">Last updated 21 November 2026, Accra (UTC+0)</p>
        <h1>Terms</h1>
        <h2>What this is</h2>
        <p>Cubby is a demonstration for BCH BLAZE 2026. The live site defaults to the test network. Test coins have no value.</p>
        <h2>The main network</h2>
        <p>Sending on the main network stays off until the project owner approves a funding address and an exact amount. Do not send coins you cannot lose.</p>
        <h2>Your box and your device</h2>
        <p>A box is tied to one website address and to the phone lock on the device that created it. If you lose that device, this team cannot open the box for you. There is no recovery phrase.</p>
        <h2>No warranty</h2>
        <p>The software is provided as a work in progress, without a warranty.</p>
        <p><Link href="/">Back to the start</Link> · <Link href="/privacy">Privacy</Link></p>
      </article>
    </div>
  );
}

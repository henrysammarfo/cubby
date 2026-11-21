import Link from 'next/link';
import '../landing.css';

export default function HowItWorks() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/cubby.svg" alt="" width={24} height={24} />
          <span>Cubby</span>
        </Link>
        <Link className="btn" href="/welcome">Open the app</Link>
      </header>
      <article className="lp-doc">
        <h1>How it works</h1>
        <p>Cubby is a box for Bitcoin Cash that only your face or fingerprint can open. The chain itself checks that approval.</p>
        <ol className="lp-how-steps" style={{ marginTop: '2rem' }}>
          <li><span className="n">01</span><div><b>Create your box</b><span>On this website, approve with Face ID or your fingerprint. The box address is created on your device and stays tied to this site.</span></div></li>
          <li><span className="n">02</span><div><b>Receive coins</b><span>Share the code, copy the address, or connect Paytaca, Selene, or Cashonize. On the test network, get test coins from the faucet link in the app.</span></div></li>
          <li><span className="n">03</span><div><b>Send with your face</b><span>Enter an amount and an address, review the payment, hold to confirm, then approve with your phone lock. You get a receipt with a payment id you can open on the explorer.</span></div></li>
        </ol>
        <h2>What you should know</h2>
        <p>Test coins have no value. Sending on the main network stays off until it is approved.</p>
        <p>A send from the box needs about 20 000 test units so the network fee fits.</p>
        <p>A real iPhone Face ID spend on the live site has not been completed yet. The in-app path is ready. The checklist is in the project docs, in FACE-ID-TEST.md.</p>
        <h2>For reviewers</h2>
        <p>Technical detail lives in the docs, not in the app: ARCHITECTURE.md (how the chain check works), SECURITY.md (honest limits), BOUNTIES.md (track map), and AUDIT.md (every public claim). Those files are in the repository.</p>
        <p><Link href="/welcome">Open the app</Link> · <Link href="/">Back to the start</Link></p>
      </article>
    </div>
  );
}

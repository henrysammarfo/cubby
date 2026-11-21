import Link from 'next/link';
import '../landing.css';

export const metadata = {
  title: 'Cubby intro · BLAZE 2026',
  description: 'The 8-slide Cubby intro deck for BCH BLAZE 2026.',
};

export default function DeckPage() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/cubby.svg" alt="" width={24} height={24} />
          <span>Cubby</span>
        </Link>
        <Link className="btn" href="/wallet?demo=1">Try the demo</Link>
      </header>
      <article className="lp-doc" style={{ maxWidth: '56rem' }}>
        <p className="upd">8 slides · BCH BLAZE 2026</p>
        <h1>Cubby intro</h1>
        <p>A short deck on the box, the on-chain check, and how Cubby makes money. Open the PDF to read all 8 slides.</p>
        <div className="lp-ctas" style={{ marginBottom: '1.25rem' }}>
          <a className="btn big" href="/cubby-blaze-2026.pdf">Open the PDF</a>
          <a className="btn ghost big" href="/cubby-blaze-2026.pdf" download="cubby-blaze-2026.pdf">Download</a>
        </div>
        <div className="film">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="deck-preview" src="/deck/preview.png" width={1440} height={810} alt="First slide of the Cubby BLAZE 2026 intro deck" />
          <iframe className="deck-frame" title="Cubby BLAZE 2026 intro deck, 8 slides" src="/cubby-blaze-2026.pdf#view=FitH" />
        </div>
        <p className="film-alt"><Link href="/">Back to the start</Link> · <Link href="/wallet?demo=1">Try the demo</Link></p>
      </article>
    </div>
  );
}

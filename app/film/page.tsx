import Link from 'next/link';
import '../landing.css';
import { FilmPlayer } from '@/ui/Film';

export const metadata = { title: 'The film · Cubby' };

export default function FilmPage() {
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
      <article className="lp-doc" style={{ maxWidth: '56rem' }}>
        <p className="upd">A 20 second look at Cubby on the test network.</p>
        <h1>The film</h1>
        <div className="film" style={{ marginTop: '1.5rem' }}>
          <FilmPlayer />
        </div>
        <p><Link href="/#film">Back to the start</Link> · <Link href="/welcome">Open the app</Link></p>
      </article>
    </div>
  );
}

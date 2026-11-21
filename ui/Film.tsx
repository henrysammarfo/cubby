'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';

export function FilmPlayer({ auto = false }: { auto?: boolean }) {
  const [on, setOn] = useState(auto);
  if (!on) {
    return (
      <button type="button" className="film-poster" onClick={() => setOn(true)} aria-label="Play the film">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/film/poster.jpg" alt="" width={1280} height={720} />
        <span className="film-play"><Play size={28} fill="currentColor" aria-hidden />Watch the film</span>
      </button>
    );
  }
  return (
    <video
      className="film-video"
      controls
      autoPlay
      playsInline
      preload="none"
      poster="/film/poster.jpg"
      src="/cubby-demo.mp4"
    >
      Your browser cannot play this film. Open the app instead.
    </video>
  );
}

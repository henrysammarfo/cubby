export function VerifiedBadge({ label = 'Verified' }: { label?: string }) {
  return (
    <div className="badge" aria-label={label}>
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path fill="#FFB020" d="M60 4 72 16.5 88 10l6 16.5L110.5 32 104 48l12 12-12 12 6.5 16-16.5 5.5L88 110l-16-6.5L60 116l-12-12.5L32 110l-6-16.5L9.5 88 16 72 4 60l12-12-6.5-16L26 26.5 32 10l16 6.5L60 4Z"/>
        <path fill="#FF5A1F" d="M60 16 69.5 26 82 21.5 86.5 34.5 100 38.5 95 50.5 104 60 95 69.5 100 81.5 86.5 85.5 82 98.5 69.5 94 60 104 50.5 94 38 98.5 33.5 85.5 20 81.5 25 69.5 16 60 25 50.5 20 38.5 33.5 34.5 38 21.5 50.5 26 60 16Z"/>
        <circle cx="60" cy="60" r="28" fill="#fff"/>
        <path d="M46 61.5 55.5 71 76 48" stroke="#0B0B0F" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

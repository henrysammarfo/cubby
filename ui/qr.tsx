'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function AddressQr({ value, alt }: { value: string; alt: string }) {
  const [src, setSrc] = useState<string>('');
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 1, width: 480, errorCorrectionLevel: 'H', color: { dark: '#0B0B0F', light: '#FFFFFF' } })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setSrc(''); });
    return () => { cancelled = true; };
  }, [value]);
  if (!src) return <div className="skel" style={{ width: '16rem', height: '16rem' }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="qr" src={src} alt={alt} width={480} height={480} />;
}

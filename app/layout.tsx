import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/ui/Providers';
import { BlazeBanner } from '@/ui/Banner';

export const metadata: Metadata = {
  metadataBase: new URL('https://cubby-liart-six.vercel.app'),
  title: 'Cubby',
  description: 'Your face is the key. Cubby is a Bitcoin Cash wallet you open with Face ID, with no seed phrase. The Bitcoin Cash network itself checks it is really you.',
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0B0F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/BricolageGrotesque-var.ttf" as="font" type="font/ttf" crossOrigin="" />
      </head>
      <body>
        <Providers>
          <BlazeBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/ui/Providers';
import { BlazeBanner } from '@/ui/Banner';

export const metadata: Metadata = {
  metadataBase: new URL('https://cubby-liart-six.vercel.app'),
  title: 'Cubby',
  description: 'A box only your face can open. Lock Bitcoin Cash with Face ID or your fingerprint. The chain checks the approval itself.',
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F7F2EA',
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

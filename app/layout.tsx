import type { Metadata, Viewport } from 'next';
import WalletProvider from '@/components/wallet/WalletContext';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://wallet.steinchain.com'),
  title: 'steinwallet · Stein Chain wallet',
  description:
    'A browser wallet for Stein Chain, the post-quantum layer-1. Create an account, hold STEIN and send it, signed in your browser with FN-DSA.',
  applicationName: 'steinwallet',
  // A devnet tool, not a marketing surface.
  robots: { index: false, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#070d1a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

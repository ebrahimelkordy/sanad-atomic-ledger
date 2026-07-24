import './globals.css';
import type { Metadata } from 'next';
import { IBM_Plex_Sans_Arabic, Cairo, JetBrains_Mono, IBM_Plex_Mono } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'Cipher — لوحة تحكم',
  description: 'منصة Cipher لإدارة الأوردرات والمالية عبر WhatsApp AI',
};

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-next',
  display: 'swap',
});

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display-next',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono-next',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono-alt-next',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${ibmPlexSansArabic.variable} ${cairo.variable} ${jetbrainsMono.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}


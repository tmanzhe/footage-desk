import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Footage Desk — turn your footage into a first cut',
  description: 'Organize your footage, trim the good moments, and export a rough cut.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Teman Dengar',
  description: 'Ruang aman untuk berbagi perasaan. Chatbot pendamping kesehatan mental yang penuh empati.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={inter.className} style={{ height: '100%' }}>
      <body style={{ height: '100%', overflow: 'hidden' }}>{children}</body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '../components/layout/Navbar';
import { Background } from '../components/layout/Background';
import { ThemeProvider } from '../components/layout/ThemeContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GoalXI - Football Manager',
  description: 'Next-gen football management simulation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-black text-emerald-400 font-mono antialiased selection:bg-emerald-500 selection:text-black`}>
        <ThemeProvider>
          <Background />
          <div className="relative z-10">
            <Navbar />
            <main>{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

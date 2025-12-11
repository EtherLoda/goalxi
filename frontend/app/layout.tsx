import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '../components/layout/Navbar';
import { Background } from '../components/layout/Background';
import { ThemeProvider } from '@/components/theme-provider';

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
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-emerald-400 font-mono antialiased selection:bg-emerald-500 selection:text-white dark:selection:text-black transition-colors duration-300`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <Background />
          <div className="relative z-10">
            {/* Navbar removed as requested in previous sessions, or check if it exists */}
            {/* Keeping Navbar if it was there, but user mentioned HUD header in page.tsx */}
            {/* Wait, the viewed file had Navbar. I will keep it. */}
            <Navbar />
            <main>{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

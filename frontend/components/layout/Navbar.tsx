'use client';

import Link from 'next/link';
import { Home, Users, Trophy, Calendar, Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeContext';

export default function Navbar() {
    const { theme, toggleTheme } = useTheme();

    return (
        <nav className="border-b border-emerald-900/50 bg-black/50 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 font-black italic text-2xl tracking-tighter text-white">
                        <span className="text-emerald-500">Goal</span>XI
                    </Link>

                    <div className="hidden md:flex items-center gap-6 text-sm font-bold tracking-wide text-emerald-100/70">
                        <Link
                            href="/league/elite-league"
                            className="flex items-center gap-2 hover:text-emerald-400 transition-colors"
                        >
                            <Trophy size={16} />
                            LEAGUE
                        </Link>
                        <Link
                            href="/teams"
                            className="flex items-center gap-2 hover:text-emerald-400 transition-colors"
                        >
                            <Users size={16} />
                            TEAMS
                        </Link>
                        <Link
                            href="/matches"
                            className="flex items-center gap-2 hover:text-emerald-400 transition-colors"
                        >
                            <Calendar size={16} />
                            MATCHES
                        </Link>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg hover:bg-emerald-900/30 text-emerald-400 transition-colors"
                        aria-label="Toggle Theme"
                    >
                        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                    <button className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider px-6 py-2 rounded-full transition-all shadow-[0_0_15px_rgba(52,211,153,0.3)] hover:shadow-[0_0_25px_rgba(52,211,153,0.5)]">
                        Get Started
                    </button>
                </div>
            </div>
        </nav>
    );
}

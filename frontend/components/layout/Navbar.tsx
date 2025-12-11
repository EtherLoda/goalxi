'use client';

import Link from 'next/link';
import { Users, Trophy, Calendar } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function Navbar() {
    return (
        <nav className="sticky top-0 z-50 transition-colors duration-300 backdrop-blur-md border-b
            bg-white/80 border-slate-200
            dark:bg-black/50 dark:border-emerald-900/50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 font-black italic text-2xl tracking-tighter text-slate-900 dark:text-white">
                        <span className="text-emerald-600 dark:text-emerald-500">Goal</span>XI
                    </Link>

                    <div className="hidden md:flex items-center gap-6 text-sm font-bold tracking-wide text-slate-500 dark:text-emerald-100/70">
                        <Link
                            href="/league/elite-league"
                            className="flex items-center gap-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                            <Trophy size={16} />
                            LEAGUE
                        </Link>
                        <Link
                            href="/teams"
                            className="flex items-center gap-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                            <Users size={16} />
                            TEAMS
                        </Link>
                        <Link
                            href="/matches"
                            className="flex items-center gap-2 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                            <Calendar size={16} />
                            MATCHES
                        </Link>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <ThemeToggle />
                    <button className="text-xs font-bold uppercase tracking-wider px-6 py-2 rounded-full transition-all shadow-lg
                        bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-500/30 hover:shadow-emerald-500/50
                        dark:shadow-[0_0_15px_rgba(52,211,153,0.3)] dark:hover:shadow-[0_0_25px_rgba(52,211,153,0.5)]">
                        Get Started
                    </button>
                </div>
            </div>
        </nav>
    );
}

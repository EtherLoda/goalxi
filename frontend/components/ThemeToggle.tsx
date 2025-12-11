'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
    const { setTheme, theme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Prevent hydration mismatch
    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-slate-200 dark:border-emerald-500/30 bg-white dark:bg-black/20"></div>
        );
    }

    return (
        <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="outline-none relative p-2 rounded-full border-2 transition-all duration-300 cursor-pointer
                bg-white border-slate-200 text-slate-500 hover:border-emerald-500 hover:text-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20
                dark:bg-emerald-950/30 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:border-emerald-400 dark:hover:text-emerald-300 dark:hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
            <div className="relative w-5 h-5">
                <Sun className="absolute inset-0 h-5 w-5 rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute inset-0 h-5 w-5 rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100" />
            </div>
            <span className="sr-only">Toggle theme</span>
        </button>
    );
}

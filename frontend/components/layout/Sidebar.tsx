'use client';

import { useAuth } from '@/components/auth/AuthContext';
import {
    LayoutDashboard,
    Users,
    Calendar,
    Trophy,
    Briefcase, // For Manager/Club
    Building2, // For Stadium
    Target, // For Training/Scouts
    Settings,
    LogOut,
    ChevronDown,
    ChevronRight,
    Baby, // Youth
    Landmark // Finance/Club
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { clsx } from 'clsx';
import { ThemeToggle } from '@/components/ThemeToggle';

type NavItem = {
    label: string;
    href: string;
    icon: React.ElementType;
    subItems?: { label: string; href: string }[];
};

export default function Sidebar() {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    // Navigation Structure
    const navGroups: { title: string; items: NavItem[] }[] = [
        {
            title: 'Overview',
            items: [
                { label: 'Dashboard', href: '/', icon: LayoutDashboard },
                { label: 'Club Center', href: '/club', icon: Landmark },
                { label: 'Manager Profile', href: '/manager', icon: Briefcase },
                { label: 'Facilities', href: '/stadium', icon: Building2 },
            ]
        },
        {
            title: 'Senior Team',
            items: [
                { label: 'Squad', href: user?.teamId ? `/teams/${user.teamId}` : '/teams/my-team', icon: Users }, // Dynamic team ID
                { label: 'Matches', href: user?.teamId ? `/matches/${user.teamId}` : '/matches', icon: Calendar },
                { label: 'League', href: '/league/elite-league', icon: Trophy },
                { label: 'Transfer', href: '/transfer', icon: Target },
            ]
        },
        {
            title: 'Youth Academy',
            items: [
                { label: 'U18 Squad', href: '/youth/squad', icon: Baby },
                { label: 'Scouting', href: '/youth/scouts', icon: Target },
            ]
        }
    ];

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-emerald-900/30 flex flex-col transition-all duration-300 z-50">
            {/* Header / Logo */}
            <div className="h-16 flex items-center px-6 border-b border-emerald-900/30 bg-black/20">
                <Link href="/" className="flex items-center gap-2 font-black italic text-xl tracking-tighter text-white">
                    <span className="text-emerald-500">Goal</span>XI
                    <span className="text-xs font-normal text-emerald-500/50 bg-emerald-900/20 px-1 py-0.5 rounded ml-2">MGR</span>
                </Link>
            </div>

            {/* Scrollable Nav Area */}
            <div className="flex-1 overflow-y-auto py-6 px-3 space-y-8">
                {navGroups.map((group) => (
                    <div key={group.title}>
                        <h4 className="px-3 text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                            {group.title}
                        </h4>
                        <div className="space-y-1">
                            {group.items.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={clsx(
                                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                            isActive
                                                ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/20"
                                                : "text-slate-400 hover:text-white hover:bg-white/5"
                                        )}
                                    >
                                        <item.icon size={18} className={isActive ? "text-emerald-400" : "text-slate-500"} />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer / User */}
            <div className="p-4 border-t border-emerald-900/30 bg-black/20 space-y-4">
                <div className="flex items-center justify-between">
                    <ThemeToggle />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs ring-1 ring-emerald-500/50">
                            {user?.username?.charAt(0) || user?.email?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white truncate">{user?.username || user?.email}</div>
                            <div className="text-xs text-slate-500 truncate">{user?.teamName || 'No Team'}</div>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                        title="Logout"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </div>
        </aside>
    );
}

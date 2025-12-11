import React, { Suspense } from 'react';
import { api } from '@/lib/api';
import { TeamHeader } from '@/components/team/TeamHeader';
import { RosterTable } from '@/components/team/RosterTable';
import { SkeletonPlayerCard } from '@/components/ui/SkeletonLoader';
import Link from 'next/link';

async function TeamData({ id }: { id: string }) {
    const team = await api.getTeam(id);
    const playersRes = await api.getPlayers(id);
    const players = playersRes.data;

    return (
        <div className="min-h-screen bg-black font-mono">
            {/* Cyber Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                {/* Grid Floor */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#022c22_1px,transparent_1px),linear-gradient(to_bottom,#022c22_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50"></div>

                {/* Glow Orbs */}
                <div className="absolute top-[-10%] left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] left-[-5%] w-[35%] h-[35%] rounded-full bg-emerald-900/10 blur-[100px]"></div>
            </div>

            <div className="relative z-10 container mx-auto px-4 py-8">
                {/* Back Button */}
                <div className="mb-6">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform">←</span>
                        <span className="font-bold tracking-wider">BACK TO HOME</span>
                    </Link>
                </div>

                {/* Team Header Card */}
                <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-8 backdrop-blur-md shadow-[0_0_30px_rgba(2,44,34,0.3)] mb-8">
                    {/* Background effects */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                    <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        {/* Team Logo */}
                        <div className="w-24 h-24 rounded-xl bg-black/40 border-2 border-emerald-500/30 flex items-center justify-center overflow-hidden backdrop-blur-sm shadow-[0_0_20px_rgba(52,211,153,0.2)]">
                            {team.logoUrl ? (
                                <img src={team.logoUrl} alt={team.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-4xl font-black text-emerald-400">{team.name.charAt(0)}</span>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center gap-3 mb-2 text-emerald-400 text-xs font-bold tracking-[0.2em] uppercase">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Active Squad
                            </div>
                            <h1 className="text-5xl md:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-200 to-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                                {team.name}
                            </h1>
                        </div>
                    </div>
                </div>

                {/* Squad Roster */}
                <div className="mb-8">
                    <RosterTable players={players} />
                </div>

                {/* Additional Sections Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Schedule Section */}
                    <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-6 backdrop-blur-md">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl"></div>
                        <h2 className="text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-400 mb-4">
                            Upcoming Matches
                        </h2>
                        <p className="text-emerald-600 text-sm font-mono">No matches scheduled</p>
                    </div>

                    {/* Club Info */}
                    <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-6 backdrop-blur-md">
                        <div className="absolute bottom-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl"></div>
                        <h2 className="text-xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-400 mb-6">
                            Club Statistics
                        </h2>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center border-b border-emerald-900/30 pb-3">
                                <span className="text-emerald-600 text-xs font-bold tracking-wider uppercase">Matches</span>
                                <span className="text-white font-mono text-xl font-bold">0</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-emerald-900/30 pb-3">
                                <span className="text-emerald-600 text-xs font-bold tracking-wider uppercase">Wins</span>
                                <span className="text-emerald-400 font-mono text-xl font-bold">0</span>
                            </div>
                            <div className="flex justify-between items-center pt-1">
                                <span className="text-emerald-600 text-xs font-bold tracking-wider uppercase">Goals</span>
                                <span className="text-white font-mono text-xl font-bold">0</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TeamLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-black font-mono">
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#022c22_1px,transparent_1px),linear-gradient(to_bottom,#022c22_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50"></div>
                <div className="absolute top-[-10%] left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px] animate-pulse"></div>
            </div>

            <div className="relative z-10 container mx-auto px-4 py-8">
                <div className="mb-6">
                    <div className="h-4 w-32 bg-emerald-950/40 rounded animate-pulse"></div>
                </div>

                {/* Team Header Skeleton */}
                <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-8 backdrop-blur-md mb-8">
                    <div className="flex gap-6">
                        <div className="w-24 h-24 rounded-xl bg-emerald-950/40 animate-pulse"></div>
                        <div className="space-y-4">
                            <div className="h-8 w-64 bg-emerald-950/40 rounded animate-pulse"></div>
                            <div className="h-4 w-32 bg-emerald-950/40 rounded animate-pulse"></div>
                        </div>
                    </div>
                </div>

                {/* Roster Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-8">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonPlayerCard key={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return (
        <Suspense fallback={<TeamLoadingSkeleton />}>
            <TeamData id={id} />
        </Suspense>
    );
}

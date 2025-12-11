
import React from 'react';
import { api } from '@/lib/api';
import { TeamHeader } from '@/components/team/TeamHeader';
import { RosterTable } from '@/components/team/RosterTable';
import Link from 'next/link';

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Fetch Data
    const team = await api.getTeam(id);
    const playersRes = await api.getPlayers(id);
    const players = playersRes.data;

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-4">
                <Link href="/league/123" className="text-sm text-slate-400 hover:text-white transition-colors">
                    ← Back to League (Placeholder Link)
                </Link>
            </div>

            <TeamHeader
                name={team.name}
                logoUrl={team.logoUrl}
            // managerName="Unknown Manager" 
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <RosterTable players={players} />

                    {/* Placeholder for Schedule */}
                    <div className="bg-slate-800 rounded-lg p-6 shadow-lg border border-slate-700">
                        <h2 className="text-xl font-bold text-white mb-4">Season Schedule</h2>
                        <p className="text-slate-400 text-center py-8">Schedule component coming soon...</p>
                    </div>
                </div>

                <div className="space-y-8">
                    {/* Sidebar Stats? */}
                    <div className="bg-slate-800 rounded-lg p-6 shadow-lg border border-slate-700">
                        <h2 className="text-xl font-bold text-white mb-4">Club Info</h2>
                        <div className="space-y-4">
                            <div className="flex justify-between border-b border-slate-700 pb-2">
                                <span className="text-slate-400">Founded</span>
                                <span className="text-white">2024</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-700 pb-2">
                                <span className="text-slate-400">Stadium</span>
                                <span className="text-white">GoalXI Stadium</span>
                            </div>
                            <div className="flex justify-between py-2">
                                <span className="text-slate-400">Squad Size</span>
                                <span className="text-white">{players.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

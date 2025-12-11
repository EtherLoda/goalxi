import React from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const player = await api.getPlayer(id);
    const team = await api.getTeam(player.teamId);

    const getSkillColor = (val: number) => {
        if (val >= 16) return 'text-emerald-400 font-bold';
        if (val >= 12) return 'text-emerald-600';
        if (val >= 8) return 'text-yellow-500';
        return 'text-slate-500';
    };

    const renderAttributes = (skills: any) => {
        if (!skills) return null;
        const categories = [
            { key: 'physical', label: 'Physical' },
            { key: 'technical', label: 'Technical' },
            { key: 'mental', label: 'Mental' }
        ];

        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {categories.map(cat => {
                    const group = skills[cat.key] || {};
                    return (
                        <div key={cat.label} className="bg-slate-900 rounded-lg p-4 border border-slate-800">
                            <h3 className="text-slate-400 text-sm font-bold uppercase mb-3 border-b border-slate-800 pb-2">{cat.label}</h3>
                            <div className="space-y-2">
                                {Object.entries(group).map(([attr, val]: [string, any]) => (
                                    <div key={attr} className="flex justify-between items-center text-sm">
                                        <span className="capitalize text-slate-300">{attr.replace(/([A-Z])/g, ' $1').trim()}</span>
                                        <span className={`font-mono ${getSkillColor(Number(val))}`}>{val}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-6">
                <Link href={`/teams/${player.teamId}`} className="text-sm text-slate-400 hover:text-white transition-colors">
                    ← Back to {team.name}
                </Link>
            </div>

            {/* Header */}
            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 shadow-xl mb-8">
                <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                    <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-3xl shrink-0">
                        Top
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <div className="flex flex-col md:flex-row md:items-end gap-2 mb-2">
                            <h1 className="text-3xl font-bold text-white">{player.name}</h1>
                            <span className="text-slate-400 text-lg mb-1">{player.age} years old</span>
                        </div>
                        <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                            <span className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-sm font-bold border border-blue-600/30">
                                {player.isGoalkeeper ? 'Goalkeeper' : 'Outfield'}
                            </span>
                            <span className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm">
                                {team.name}
                            </span>
                            {player.isYouth && (
                                <span className="bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm font-bold border border-yellow-500/30">
                                    Youth Academy
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="bg-slate-900/50 rounded p-3 min-w-[100px]">
                            <div className="text-xs text-slate-500 uppercase font-bold">Stamina</div>
                            <div className="text-2xl font-bold text-white">{player.stamina}</div>
                        </div>
                        <div className="bg-slate-900/50 rounded p-3 min-w-[100px]">
                            <div className="text-xs text-slate-500 uppercase font-bold">Form</div>
                            <div className="text-2xl font-bold text-white">{player.form}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Attributes */}
            <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-4">Attributes</h2>
                {renderAttributes(player.currentSkills)}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
                    <h3 className="text-lg font-bold text-white mb-4">Info</h3>
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                        <dt className="text-slate-400">Potential Tier</dt>
                        <dd className="text-white font-medium">{player.potentialTier ?? 'Unknown'}</dd>

                        <dt className="text-slate-400">Experience</dt>
                        <dd className="text-white font-medium">{player.experience ?? 0}</dd>

                        <dt className="text-slate-400">Transfer Listed</dt>
                        <dd className="text-white font-medium">{player.onTransfer ? 'Yes' : 'No'}</dd>
                    </dl>
                </div>
            </div>

        </div>
    );
}

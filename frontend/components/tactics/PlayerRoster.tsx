'use client';

import { useState } from 'react';
import { Player } from '@/lib/api';
import { Search } from 'lucide-react';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance, convertAppearance } from '@/utils/playerUtils';
import { AbilityStars } from '@/components/ui/AbilityStars';

interface PlayerRosterProps {
    players: Player[];
    assignedPlayerIds: Set<string>;
    onDragStart: (playerId: string) => void;
    onDragEnd?: () => void;
}

export function PlayerRoster({ players, assignedPlayerIds, onDragStart, onDragEnd }: PlayerRosterProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [positionFilter, setPositionFilter] = useState<string>('all');

    const getPositionCategory = (position: string): string => {
        if (position === 'GK') return 'GK';
        if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(position)) return 'DEF';
        if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(position)) return 'MID';
        if (['LW', 'RW', 'ST', 'CF'].includes(position)) return 'FWD';
        return 'MID';
    };

    const filteredPlayers = players.filter(player => {
        const matchesSearch = (player.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        const playerPos = player.isGoalkeeper ? 'GK' : 'Outfielder';
        const matchesPosition = positionFilter === 'all' || getPositionCategory(playerPos) === positionFilter;
        return matchesSearch && matchesPosition;
    });

    const availablePlayers = filteredPlayers.filter(p => !assignedPlayerIds.has(p.id));
    const assignedPlayers = filteredPlayers.filter(p => assignedPlayerIds.has(p.id));

    // Helper for drag start
    const handleDragStart = (e: React.DragEvent, playerId: string) => {
        const dragIcon = e.currentTarget.querySelector('.js-avatar-drag-target');
        if (dragIcon) {
            e.dataTransfer.setDragImage(dragIcon, 32, 32);
        }
        onDragStart(playerId);
    };

    const handleDragEnd = () => {
        if (onDragEnd) {
            onDragEnd();
        }
    };

    return (
        <div className="rounded-xl border-2 overflow-hidden h-[700px] flex flex-col
            bg-white border-emerald-500/40
            dark:bg-emerald-950/20 dark:border-emerald-500/30">

            {/* Header */}
            <div className="p-4 border-b border-emerald-500/40 dark:border-emerald-500/30
                bg-slate-50 dark:bg-black/20">
                <h3 className="text-base font-black italic uppercase tracking-wider text-emerald-900 dark:text-emerald-400 mb-4 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Roster Selection
                </h3>

                {/* Search */}
                <div className="relative mb-4 group">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-emerald-600 transition-colors group-hover:text-emerald-500" />
                    <input
                        type="text"
                        placeholder="Search players..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-all font-medium
                            bg-white border-emerald-200 text-slate-900 placeholder-slate-400
                            dark:bg-black/40 dark:border-emerald-800 dark:text-white dark:placeholder-emerald-700
                            focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                </div>

                {/* Position Filter */}
                <div className="flex gap-2 flex-wrap">
                    {['all', 'GK', 'DEF', 'MID', 'FWD'].map(pos => (
                        <button
                            key={pos}
                            onClick={() => setPositionFilter(pos)}
                            className={`px-4 py-1.5 rounded-md text-xs font-black uppercase tracking-wider transition-all border ${positionFilter === pos
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                                : 'bg-white border-emerald-200 text-slate-500 hover:bg-emerald-50 dark:bg-black/40 dark:border-emerald-800 dark:text-emerald-700 dark:hover:border-emerald-600 dark:hover:text-emerald-500'
                                }`}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
            </div>

            {/* Player List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-black/20">
                {availablePlayers.length === 0 && assignedPlayers.length === 0 ? (
                    <div className="text-center text-base text-slate-500 dark:text-emerald-600/50 py-12 flex flex-col items-center gap-3">
                        <span className="text-3xl">🔍</span>
                        No players found
                    </div>
                ) : (
                    <>
                        {/* Available Players */}
                        {availablePlayers.map(player => {
                            const appearance = convertAppearance(player.appearance) || generateAppearance(player.id);

                            const skills = player.currentSkills || {};

                            // Group stats
                            const physical = skills.physical ?
                                Object.entries(skills.physical).map(([k, v]) => ({ label: k.substring(0, 3).toUpperCase(), value: v as number })) : [];
                            const technical = skills.technical ?
                                Object.entries(skills.technical).map(([k, v]) => ({ label: k.substring(0, 3).toUpperCase(), value: v as number })) : [];
                            const mental = skills.mental ?
                                Object.entries(skills.mental).map(([k, v]) => ({ label: k.substring(0, 3).toUpperCase(), value: v as number })) : [];

                            return (
                                <div
                                    key={player.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, player.id)}
                                    onDragEnd={handleDragEnd}
                                    className="group relative rounded-xl border-2 cursor-move transition-all duration-200 overflow-hidden
                                        bg-white border-slate-200 hover:border-emerald-500 hover:shadow-[0_4px_25px_rgba(16,185,129,0.25)] hover:-translate-y-1
                                        dark:bg-black/60 dark:border-emerald-500/20 dark:hover:bg-emerald-950/40 dark:hover:border-emerald-400"
                                >
                                    {/* Scanline effect on hover */}
                                    <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(16,185,129,0.05)_50%)] bg-size-100%_4px pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                    <div className="relative p-4">
                                        <div className="flex gap-5">
                                            {/* Avatar Column */}
                                            <div className="flex flex-col items-center gap-2.5 shrink-0">
                                                <div className="border-2 border-slate-100 dark:border-emerald-500/30 rounded-full p-1 bg-white dark:bg-black/40 shadow-sm">
                                                    <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 dark:bg-emerald-900/40 relative js-avatar-drag-target">
                                                        <MiniPlayer
                                                            appearance={appearance}
                                                            size={64}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider
                                                    bg-slate-100 text-slate-600
                                                    dark:bg-emerald-500/10 dark:text-emerald-400">
                                                    {player.isGoalkeeper ? 'GK' : 'Outfielder'}
                                                </div>
                                            </div>

                                            {/* Info Column */}
                                            <div className="flex-1 min-w-0">
                                                {/* Header */}
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="font-black italic text-base sm:text-lg text-slate-800 dark:text-white truncate pr-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                                            {player.name}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <AbilityStars currentSkills={player.currentSkills} isGoalkeeper={player.isGoalkeeper} size="sm" />
                                                        </div>
                                                    </div>
                                                    <div className="text-3xl font-black leading-none text-slate-300 dark:text-emerald-800 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                                        {player.overall}
                                                    </div>
                                                </div>

                                                {/* Secondary Stats */}
                                                <div className="flex gap-4 text-[10px] sm:text-xs font-mono text-slate-400 dark:text-emerald-700 font-bold border-b border-slate-100 dark:border-emerald-500/10 pb-2 mb-3">
                                                    <span>STA <span className="text-slate-600 dark:text-emerald-500 text-xs sm:text-sm ml-1">{player.stamina}</span></span>
                                                    <span>FRM <span className="text-slate-600 dark:text-emerald-500 text-xs sm:text-sm ml-1">{player.form}</span></span>
                                                    <span>EXP <span className="text-slate-600 dark:text-emerald-500 text-xs sm:text-sm ml-1">{player.experience || 0}</span></span>
                                                </div>

                                                {/* Skills Categorized */}
                                                <div className="grid grid-cols-3 gap-2">
                                                    {/* Physical */}
                                                    <div className="bg-slate-50 dark:bg-emerald-500/5 rounded p-2 border border-slate-100 dark:border-emerald-500/10 hidden sm:block">
                                                        <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-200 dark:border-emerald-500/20 pb-1">
                                                            <span className="text-xs grayscale opacity-70">⚡</span>
                                                            <div className="text-[10px] font-black uppercase text-slate-400 dark:text-emerald-600">PHY</div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            {physical.slice(0, 3).map(s => (
                                                                <div key={s.label} className="flex justify-between text-[10px]">
                                                                    <span className="text-slate-400 dark:text-emerald-700/70">{s.label}</span>
                                                                    <span className="font-bold text-slate-600 dark:text-emerald-400">{s.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Technical */}
                                                    <div className="bg-slate-50 dark:bg-blue-500/5 rounded p-2 border border-slate-100 dark:border-blue-500/10 col-span-2 sm:col-span-1">
                                                        <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-200 dark:border-blue-500/20 pb-1">
                                                            <span className="text-xs grayscale opacity-70">⚽</span>
                                                            <div className="text-[10px] font-black uppercase text-slate-400 dark:text-blue-500">TEC</div>
                                                        </div>
                                                        <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-2 gap-y-1">
                                                            {technical.slice(0, 4).map(s => (
                                                                <div key={s.label} className="flex justify-between text-[10px]">
                                                                    <span className="text-slate-400 dark:text-blue-700/70">{s.label}</span>
                                                                    <span className="font-bold text-slate-600 dark:text-blue-400">{s.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Mental */}
                                                    <div className="bg-slate-50 dark:bg-purple-500/5 rounded p-2 border border-slate-100 dark:border-purple-500/10 hidden sm:block">
                                                        <div className="flex items-center gap-1.5 mb-1.5 border-b border-slate-200 dark:border-purple-500/20 pb-1">
                                                            <span className="text-xs grayscale opacity-70">🧠</span>
                                                            <div className="text-[10px] font-black uppercase text-slate-400 dark:text-purple-500">MEN</div>
                                                        </div>
                                                        <div className="space-y-1">
                                                            {mental.slice(0, 3).map(s => (
                                                                <div key={s.label} className="flex justify-between text-[10px]">
                                                                    <span className="text-slate-400 dark:text-purple-700/70">{s.label}</span>
                                                                    <span className="font-bold text-slate-600 dark:text-purple-400">{s.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Assigned Players (Compact) */}
                        {assignedPlayers.length > 0 && (
                            <div className="pt-6 pb-2">
                                <div className="text-xs font-black text-slate-400 dark:text-emerald-700 uppercase tracking-[0.2em] pl-3 mb-4">On Pitch</div>
                                {assignedPlayers.map(player => {
                                    const appearance = convertAppearance(player.appearance) || generateAppearance(player.id);
                                    return (
                                        <div
                                            key={player.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, player.id)}
                                            onDragEnd={handleDragEnd}
                                            className="mb-3 p-3 rounded-lg border flex items-center gap-4 opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-move
                                                bg-slate-50 border-slate-200 
                                                dark:bg-black/20 dark:border-slate-800"
                                        >
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0 border border-slate-300 dark:border-slate-700 js-avatar-drag-target">
                                                <MiniPlayer
                                                    appearance={appearance}
                                                    size={40}
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{player.name}</div>
                                                <div className="text-xs text-slate-500 font-mono">{player.isGoalkeeper ? 'GK' : 'Outfielder'}</div>
                                            </div>
                                            <div className="text-lg font-black text-slate-300 dark:text-slate-600">{player.overall}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

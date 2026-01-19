'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Player } from '@/lib/api';
import { ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance, convertAppearance } from '@/utils/playerUtils';
import { AbilityStars } from '@/components/ui/AbilityStars';

interface PlayerRosterProps {
    players: Player[];
    assignedPlayerIds: Set<string>;
    onDragStart: (playerId: string) => void;
    onDragEnd?: () => void;
}

type SortField =
    | 'overall' | 'stamina' | 'form' | 'experience'
    | 'pace' | 'finishing' | 'passing' | 'dribbling' | 'defending'
    | 'physical' | 'mental' | 'freeKicks' | 'penalties';
type SortDirection = 'asc' | 'desc';

const SORT_OPTIONS = [
    { value: 'overall', label: 'Overall' },
    { value: 'stamina', label: 'Stamina' },
    { value: 'form', label: 'Form' },
    { value: 'experience', label: 'Experience' },
    { value: 'physical', label: 'Physical' },
    { value: 'pace', label: 'Pace' },
    { value: 'finishing', label: 'Finishing' },
    { value: 'passing', label: 'Passing' },
    { value: 'dribbling', label: 'Dribbling' },
    { value: 'defending', label: 'Defending' },
    { value: 'mental', label: 'Mental' },
    { value: 'freeKicks', label: 'Free Kicks' },
    { value: 'penalties', label: 'Penalties' },
];

export function PlayerRoster({ players, assignedPlayerIds, onDragStart, onDragEnd }: PlayerRosterProps) {
    const [sortField, setSortField] = useState<SortField>('overall');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const sortRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
                setIsSortOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getSkillValue = (player: Player, skill: string): number => {
        if (!player.currentSkills) return 0;
        const skills = player.currentSkills;
        if (skill === 'physical') return (skills as any)?.physical?.pace || 0;
        if (skill === 'mental') return (skills as any)?.mental?.positioning || 0;
        if (skill === 'freeKicks') return skills.setPieces?.freeKicks || 0;
        if (skill === 'penalties') return skills.setPieces?.penalties || 0;
        return (skills as any)?.technical?.[skill] || 0;
    };

    const sortedPlayers = useMemo(() => {
        return [...players].sort((a, b) => {
            let aVal: number, bVal: number;
            switch (sortField) {
                case 'overall': aVal = a.overall; bVal = b.overall; break;
                case 'stamina': aVal = a.stamina; bVal = b.stamina; break;
                case 'form': aVal = a.form; bVal = b.form; break;
                case 'experience': aVal = a.experience || 0; bVal = b.experience || 0; break;
                case 'pace': case 'physical': aVal = getSkillValue(a, 'physical'); bVal = getSkillValue(b, 'physical'); break;
                case 'finishing': case 'passing': case 'dribbling': case 'defending':
                    aVal = getSkillValue(a, sortField); bVal = getSkillValue(b, sortField); break;
                case 'mental': aVal = getSkillValue(a, 'mental'); bVal = getSkillValue(b, 'mental'); break;
                case 'freeKicks': aVal = getSkillValue(a, 'freeKicks'); bVal = getSkillValue(b, 'freeKicks'); break;
                case 'penalties': aVal = getSkillValue(a, 'penalties'); bVal = getSkillValue(b, 'penalties'); break;
                default: aVal = a.overall; bVal = b.overall;
            }
            return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
        });
    }, [players, sortField, sortDirection]);

    const availablePlayers = sortedPlayers.filter(p => !assignedPlayerIds.has(p.id));
    const assignedPlayers = sortedPlayers.filter(p => assignedPlayerIds.has(p.id));

    // Helper for drag start
    const handleDragStart = (e: React.DragEvent, playerId: string) => {
        const dragIcon = e.currentTarget.querySelector('.js-avatar-drag-target');
        if (dragIcon) {
            e.dataTransfer.setDragImage(dragIcon, 32, 32);
        }
        // Pass playerId via dataTransfer for cross-component drag
        e.dataTransfer.setData('playerId', playerId);
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

                {/* Sort Controls */}
                <div className="flex items-center gap-2">
                    <div className="flex border rounded-lg overflow-hidden">
                        <button
                            onClick={() => setSortDirection('desc')}
                            className={`flex items-center justify-center w-8 h-9 transition-all ${
                                sortDirection === 'desc' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 dark:bg-black/40'
                            }`}
                        >
                            <ArrowDown size={14} />
                        </button>
                        <button
                            onClick={() => setSortDirection('asc')}
                            className={`flex items-center justify-center w-8 h-9 transition-all border-l ${
                                sortDirection === 'asc' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 dark:bg-black/40'
                            }`}
                        >
                            <ArrowUp size={14} />
                        </button>
                    </div>

                    <div className="relative flex-1" ref={sortRef}>
                        <button
                            onClick={() => setIsSortOpen(!isSortOpen)}
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-xl hover:border-emerald-400 transition-all"
                        >
                            <span className="text-sm font-medium text-slate-900 dark:text-white">
                                {SORT_OPTIONS.find(o => o.value === sortField)?.label}
                            </span>
                            <ChevronDown size={14} className={`text-emerald-500 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Dropdown */}
                        {isSortOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-950 border border-emerald-200 dark:border-emerald-800 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                {SORT_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => {
                                            setSortField(opt.value as SortField);
                                            setIsSortOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-3 py-2 text-left transition-all ${
                                            sortField === opt.value
                                                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        <span className="text-sm font-medium">{opt.label}</span>
                                        {sortField === opt.value && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
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
                                            <div className="flex flex-col items-center gap-2 shrink-0">
                                                <div className="border-2 border-slate-100 dark:border-emerald-500/30 rounded-full p-1 bg-white dark:bg-black/40 shadow-sm">
                                                    <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 dark:bg-emerald-900/40 relative js-avatar-drag-target">
                                                        <MiniPlayer
                                                            appearance={appearance}
                                                            size={56}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Info Column */}
                                            <div className="flex-1 min-w-0">
                                                {/* Header */}
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider
                                                                bg-slate-100 text-slate-600
                                                                dark:bg-emerald-500/10 dark:text-emerald-400">
                                                                {player.isGoalkeeper ? 'GK' : 'OUT'}
                                                            </span>
                                                            <div className="font-black italic text-base text-slate-800 dark:text-white truncate pr-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                                                                {player.name}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <AbilityStars currentSkills={player.currentSkills} isGoalkeeper={player.isGoalkeeper} size="sm" />
                                                        </div>
                                                    </div>
                                                    <div className="text-3xl font-black leading-none text-slate-300 dark:text-emerald-800 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                                        {player.overall}
                                                    </div>
                                                </div>

                                                {/* Secondary Stats - battery for STA, circles for FRM */}
                                                <div className="flex gap-6 items-center border-b border-slate-100 dark:border-emerald-500/10 pb-2 mb-2">
                                                    {/* Stamina - Battery bars */}
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex gap-0.5">
                                                            {[1, 2, 3, 4, 5].map(level => (
                                                                <div
                                                                    key={level}
                                                                    className={`w-1.5 h-3 rounded-sm ${
                                                                        player.stamina >= level
                                                                            ? player.stamina >= 4 ? 'bg-emerald-500'
                                                                                : player.stamina >= 2 ? 'bg-yellow-500'
                                                                                    : 'bg-red-500'
                                                                            : 'bg-slate-200 dark:bg-slate-700'
                                                                    }`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {/* Form - circles */}
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex gap-1">
                                                            {[1, 2, 3, 4, 5].map(level => (
                                                                <div
                                                                    key={level}
                                                                    className={`w-2.5 h-2.5 rounded-full ${
                                                                        player.form >= level
                                                                            ? player.form >= 4 ? 'bg-emerald-500'
                                                                                : player.form >= 2 ? 'bg-yellow-500'
                                                                                    : 'bg-red-500'
                                                                            : 'bg-slate-200 dark:bg-slate-700'
                                                                    }`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Skills Categorized - 4 columns full width */}
                                                <div className="grid grid-cols-9 gap-3">
                                                    {/* Physical */}
                                                    <div className="col-span-2 bg-slate-50 dark:bg-emerald-500/5 rounded p-2 border border-slate-100 dark:border-emerald-500/10">
                                                        <div className="flex items-center gap-1.5 mb-1 border-b border-slate-200 dark:border-emerald-500/20 pb-1">
                                                            <span className="text-xs grayscale opacity-70">⚡</span>
                                                            <div className="text-[10px] font-black uppercase text-emerald-600">PHY</div>
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            {physical.slice(0, 3).map(s => (
                                                                <div key={s.label} className="flex justify-between text-[10px]">
                                                                    <span className="text-slate-400">{s.label}</span>
                                                                    <span className="font-bold text-emerald-600">{s.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Technical - 1.5x wider */}
                                                    <div className="col-span-3 bg-slate-50 dark:bg-blue-500/5 rounded p-2 border border-slate-100 dark:border-blue-500/10">
                                                        <div className="flex items-center gap-1.5 mb-1 border-b border-slate-200 dark:border-blue-500/20 pb-1">
                                                            <span className="text-xs grayscale opacity-70">⚽</span>
                                                            <div className="text-[10px] font-black uppercase text-blue-500">TEC</div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                                            {technical.slice(0, 4).map(s => (
                                                                <div key={s.label} className="flex justify-between text-[10px]">
                                                                    <span className="text-slate-400">{s.label}</span>
                                                                    <span className="font-bold text-blue-500">{s.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Mental */}
                                                    <div className="col-span-2 bg-slate-50 dark:bg-purple-500/5 rounded p-2 border border-slate-100 dark:border-purple-500/10">
                                                        <div className="flex items-center gap-1.5 mb-1 border-b border-slate-200 dark:border-purple-500/20 pb-1">
                                                            <span className="text-xs grayscale opacity-70">🧠</span>
                                                            <div className="text-[10px] font-black uppercase text-purple-500">MEN</div>
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            {mental.slice(0, 3).map(s => (
                                                                <div key={s.label} className="flex justify-between text-[10px]">
                                                                    <span className="text-slate-400">{s.label}</span>
                                                                    <span className="font-bold text-purple-500">{s.value}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Set Pieces */}
                                                    <div className="col-span-2 bg-slate-50 dark:bg-amber-500/5 rounded p-2 border border-slate-100 dark:border-amber-500/10">
                                                        <div className="flex items-center gap-1.5 mb-1 border-b border-slate-200 dark:border-amber-500/20 pb-1">
                                                            <span className="text-xs grayscale opacity-70">🎯</span>
                                                            <div className="text-[10px] font-black uppercase text-amber-500">SP</div>
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            {skills.setPieces ? (
                                                                <>
                                                                    <div className="flex justify-between text-[10px]">
                                                                        <span className="text-slate-400">FK</span>
                                                                        <span className="font-bold text-amber-500">{skills.setPieces.freeKicks}</span>
                                                                    </div>
                                                                    <div className="flex justify-between text-[10px]">
                                                                        <span className="text-slate-400">PEN</span>
                                                                        <span className="font-bold text-amber-500">{skills.setPieces.penalties}</span>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <div className="text-[10px] text-slate-400">-</div>
                                                            )}
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
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded
                                                        bg-slate-100 text-slate-500
                                                        dark:bg-emerald-500/10 dark:text-emerald-400">
                                                        {player.isGoalkeeper ? 'GK' : 'OUT'}
                                                    </span>
                                                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{player.name}</div>
                                                </div>
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

'use client';

import { Player } from '@/lib/api';
import { X } from 'lucide-react';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance } from '@/utils/playerUtils';
import { useState } from 'react';

interface PitchLayoutProps {
    lineup: Record<string, string | null>;
    players: Player[];
    onDrop: (position: string) => void;
    onRemove: (position: string) => void;
    onDragStart: (playerId: string, position: string) => void;
    onDragEnd?: () => void;
    isDragging?: boolean;
}

// Position coordinates on the pitch (grid-based, y increases downward from attack to defense)
// Precise position coordinates (percentages)
// X: 0 (left) -> 100 (right)
// Y: 0 (top/attack) -> 100 (bottom/defense)
// Optimized to prevent card overlap
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
    // Attack (Top) - Wider spread for front three
    CFL: { x: 30, y: 15 }, CF: { x: 50, y: 10 }, CFR: { x: 70, y: 15 },
    LW: { x: 8, y: 18 }, RW: { x: 92, y: 18 },

    // Attacking Midfield - Staggered Y positions to avoid overlap
    AML: { x: 30, y: 28 }, AM: { x: 50, y: 25 }, AMR: { x: 70, y: 28 },

    // Midfield - Wider horizontal spacing
    LM: { x: 8, y: 42 }, RM: { x: 92, y: 42 },
    CML: { x: 32, y: 44 }, CM: { x: 50, y: 42 }, CMR: { x: 68, y: 44 },

    // Defensive Midfield - Staggered Y positions
    DML: { x: 32, y: 58 }, DM: { x: 50, y: 56 }, DMR: { x: 68, y: 58 },

    // Wingbacks (Wide)
    WBL: { x: 8, y: 64 }, WBR: { x: 92, y: 64 },

    // Defense - Better spacing, staggered center back
    LB: { x: 8, y: 74 }, RB: { x: 92, y: 74 },
    // Center Backs (CD = Center Defender)
    CDL: { x: 34, y: 74 }, CD: { x: 50, y: 77 }, CDR: { x: 66, y: 74 },

    // Goalkeeper
    GK: { x: 50, y: 92 },
};

export function PitchLayout({ lineup, players, onDrop, onRemove, onDragStart, onDragEnd, isDragging = false }: PitchLayoutProps) {
    const [dragOverPitch, setDragOverPitch] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!dragOverPitch) {
            setDragOverPitch(true);
        }
    };

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOverPitch(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // Only set to false if we're leaving the pitch area completely
        const relatedTarget = e.relatedTarget as HTMLElement;
        const currentTarget = e.currentTarget as HTMLElement;

        // Check if we're leaving to outside the pitch
        if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
            setDragOverPitch(false);
        }
    };

    const handleDrop = (e: React.DragEvent, position: string) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent event bubbling to avoid duplicate calls
        onDrop(position);
        setDragOverPitch(false);
        if (onDragEnd) {
            onDragEnd();
        }
    };

    const handleDragEnd = (e?: React.DragEvent) => {
        // Immediately hide slots when drag ends
        setDragOverPitch(false);
        if (onDragEnd) {
            onDragEnd();
        }
    };

    const handleDragStart = (playerId: string, position: string) => {
        onDragStart(playerId, position);
    };

    const handleRemovePlayer = (position: string) => {
        onRemove(position);
    };

    const getPlayerById = (playerId: string | null) => {
        if (!playerId) return null;
        return players.find(p => p.id === playerId);
    };

    return (
        <div
            className="relative aspect-3/4 w-full max-w-[700px] mx-auto rounded-xl border-4 overflow-hidden border-emerald-900/40 shadow-2xl bg-emerald-600 dark:bg-emerald-900"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragEnd={handleDragEnd}
        >
            {/* Pitch Grass Pattern */}
            <div className="absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent,transparent_10%,rgba(0,0,0,0.05)_10%,rgba(0,0,0,0.05)_20%)] pointer-events-none" />

            {/* Pitch markings */}
            <div className="absolute inset-0 opacity-40 pointer-events-none">
                {/* Center Circle */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-2 border-white/70" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/70" />

                {/* Center Line */}
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/70" />



                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[16%] border-2 border-white/70 border-b-0" />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[30%] h-[6%] border-2 border-white/70 border-b-0" />
                <div className="absolute bottom-[11%] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/70" />

                {/* Corner Arcs */}
                <div className="absolute top-0 left-0 w-8 h-8 border-b-2 border-r-2 border-white/70 rounded-br-full" />
                <div className="absolute top-0 right-0 w-8 h-8 border-b-2 border-l-2 border-white/70 rounded-bl-full" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-t-2 border-r-2 border-white/70 rounded-tr-full" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-t-2 border-l-2 border-white/70 rounded-tl-full" />
            </div>

            {/* Position slots */}
            <div className="relative h-full w-full">
                {Object.entries(POSITION_COORDS).map(([position, coords]) => {
                    const player = getPlayerById(lineup[position]);
                    const { x, y } = coords;
                    const appearance = player ? generateAppearance(player.id) : undefined;

                    return (
                        <div
                            key={position}
                            className="absolute z-10"
                            style={{
                                left: `${x}%`,
                                top: `${y}%`,
                                transform: 'translate(-50%, -50%)',
                            }}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, position)}
                        >
                            {player ? (
                                <div
                                    draggable
                                    onDragStart={() => handleDragStart(player.id, position)}
                                    onDragEnd={handleDragEnd}
                                    className="relative group cursor-move transition-transform duration-200 active:scale-95"
                                >
                                    <div className="flex flex-col items-center">
                                        {/* Player Circle/Jersey with 3D effect */}
                                        <div className="w-16 h-16 rounded-full border-2 border-white shadow-lg bg-emerald-800 flex items-center justify-center mb-1 group-hover:scale-110 group-hover:border-emerald-400 group-hover:ring-2 group-hover:ring-emerald-400/50 transition-all relative overflow-hidden transform transition-transform duration-200 hover:-translate-y-1">
                                            {appearance && (
                                                <div className="mt-2">
                                                    <MiniPlayer appearance={appearance} size={64} />
                                                </div>
                                            )}

                                            {/* Remove button (hover) */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRemovePlayer(position); }}
                                                className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px] z-20"
                                                title="Remove player from position"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>

                                        {/* Enhanced Player Info Card */}
                                        <div className="relative mt-2 group/card">
                                            <div className="bg-gradient-to-br from-slate-900/95 via-emerald-950/90 to-slate-900/95 backdrop-blur-xl px-3 py-1.5 rounded-xl shadow-2xl border border-emerald-500/30 w-[110px] transform transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:shadow-emerald-500/50 hover:border-emerald-400/60">
                                                {/* Player Name */}
                                                <div className="text-[11px] font-bold text-white truncate text-center leading-tight tracking-wide">
                                                    {player.name}
                                                </div>

                                                {/* Divider */}
                                                <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent my-1.5"></div>

                                                {/* Position and Rating Row */}
                                                <div className="flex items-center justify-between gap-2">
                                                    {/* Position Badge */}
                                                    <div className="bg-emerald-600/30 backdrop-blur-sm px-2 py-0.5 rounded-md border border-emerald-400/40">
                                                        <span className="text-[9px] font-black text-emerald-300 tracking-wider">{position}</span>
                                                    </div>

                                                    {/* Overall Rating Badge */}
                                                    <div className="bg-gradient-to-br from-yellow-500/30 to-orange-500/30 backdrop-blur-sm px-2 py-0.5 rounded-md border border-yellow-400/50">
                                                        <span className="text-[10px] font-black text-yellow-300">{player.overall}</span>
                                                    </div>
                                                </div>

                                                {/* Shine effect on hover */}
                                                <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-transparent via-white/0 to-transparent group-hover/card:via-white/10 transition-all duration-500 pointer-events-none"></div>
                                            </div>

                                            {/* Glow effect */}
                                            <div className="absolute inset-0 rounded-xl bg-emerald-500/20 blur-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 -z-10"></div>
                                        </div>
                                    </div>
                                </div>
                            ) : (isDragging || dragOverPitch) ? (
                                <div
                                    className="w-10 h-10 rounded-full border-2 border-dashed border-white/50 flex items-center justify-center transition-all bg-white/10 hover:bg-white/20 hover:border-white/70 hover:scale-110 cursor-pointer"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, position)}
                                    onDragEnd={handleDragEnd}
                                >
                                    <span className="text-[9px] font-bold text-white/70">
                                        {position}
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>



        </div>
    );
}

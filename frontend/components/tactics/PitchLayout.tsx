'use client';

import { Player } from '@/lib/api';
import { X } from 'lucide-react';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance } from '@/utils/playerUtils';

interface PitchLayoutProps {
    lineup: Record<string, string | null>;
    players: Player[];
    onDrop: (position: string) => void;
    onRemove: (position: string) => void;
    onDragStart: (playerId: string, position: string) => void;
}

// Position coordinates on the pitch (grid-based, y increases downward from attack to defense)
// Precise position coordinates (percentages)
// X: 0 (left) -> 100 (right)
// Y: 0 (top/attack) -> 100 (bottom/defense)
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
    // Attack (Top)
    CFL: { x: 35, y: 15 }, CF: { x: 50, y: 12 }, CFR: { x: 65, y: 15 },
    LW: { x: 10, y: 20 }, RW: { x: 90, y: 20 },

    // Attacking Midfield
    AML: { x: 35, y: 28 }, AM: { x: 50, y: 28 }, AMR: { x: 65, y: 28 },

    // Midfield
    LM: { x: 10, y: 45 }, RM: { x: 90, y: 45 },
    CML: { x: 35, y: 45 }, CM: { x: 50, y: 45 }, CMR: { x: 65, y: 45 },

    // Defensive Midfield
    DML: { x: 35, y: 58 }, DM: { x: 50, y: 58 }, DMR: { x: 65, y: 58 },

    // Wingbacks (Wide)
    WBL: { x: 10, y: 65 }, WBR: { x: 90, y: 65 },

    // Defense
    LB: { x: 10, y: 75 }, RB: { x: 90, y: 75 },
    CDL: { x: 36, y: 75 }, CD: { x: 50, y: 78 }, CDR: { x: 64, y: 75 },

    // Goalkeeper
    GK: { x: 50, y: 92 },
};

export function PitchLayout({ lineup, players, onDrop, onRemove, onDragStart }: PitchLayoutProps) {
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, position: string) => {
        e.preventDefault();
        onDrop(position);
    };

    const getPlayerById = (playerId: string | null) => {
        if (!playerId) return null;
        return players.find(p => p.id === playerId);
    };

    return (
        <div className="relative aspect-[3/4] w-full max-w-[700px] mx-auto rounded-xl border-4 overflow-hidden border-emerald-900/40 shadow-2xl bg-emerald-600 dark:bg-emerald-900">
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
                                    onDragStart={() => onDragStart(player.id, position)}
                                    className="relative group cursor-move transition-transform duration-200 active:scale-95"
                                >
                                    <div className="flex flex-col items-center">
                                        {/* Player Circle/Jersey */}
                                        <div className="w-16 h-16 rounded-full border-2 border-white shadow-lg bg-emerald-800 flex items-center justify-center mb-1 group-hover:scale-110 group-hover:border-emerald-400 group-hover:ring-2 group-hover:ring-emerald-400/50 transition-all relative overflow-hidden">
                                            {appearance && (
                                                <div className="mt-2">
                                                    <MiniPlayer appearance={appearance} position={player.position as any} size={64} />
                                                </div>
                                            )}

                                            {/* Rating Badge */}
                                            <div className="absolute top-0 right-0 bg-emerald-600 text-[8px] font-black text-white px-1 rounded-bl shadow-sm z-10">
                                                {player.overall}
                                            </div>

                                            {/* Remove button (hover) */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onRemove(position); }}
                                                className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px] z-20"
                                            >
                                                <X size={20} />
                                            </button>
                                        </div>

                                        {/* Player Name Tag */}
                                        <div className="bg-black/70 backdrop-blur-md px-2 py-0.5 rounded shadow-sm border border-white/20 max-w-[90px]">
                                            <div className="text-[10px] font-bold text-white truncate text-center leading-tight">
                                                {player.name.split(' ').pop()}
                                            </div>
                                        </div>

                                        {/* Position Tag */}
                                        <div className="text-[9px] font-bold text-white/80 mt-0.5 drop-shadow-md hidden group-hover:block">
                                            {position}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="w-10 h-10 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center transition-all hover:bg-white/20 hover:border-white/60 hover:scale-110 cursor-pointer">
                                    <span className="text-[9px] font-bold text-white/50">
                                        {position}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>



        </div>
    );
}

'use client';

import { Player } from '@/lib/api';
import { User, Users } from 'lucide-react';
import { useState } from 'react';
import { PlayerCard } from './PlayerCard';

interface BenchProps {
    bench: Record<string, string | null>;
    players: Player[];
    onDrop: (benchSlot: string, playerId: string) => void;
    onRemove: (benchSlot: string) => void;
    onDragStart: (playerId: string, position: string) => void;
    onDragEnd?: () => void;
    isDragging?: boolean;
}

const BENCH_LABELS = ['BENCH_GK', 'BENCH_CB', 'BENCH_FB', 'BENCH_W', 'BENCH_CM', 'BENCH_FW'];

// Display labels for bench positions
const BENCH_DISPLAY_LABELS: Record<string, string> = {
    BENCH_GK: 'GK',
    BENCH_CB: 'CB',
    BENCH_FB: 'FB',
    BENCH_W: 'W',
    BENCH_CM: 'CM',
    BENCH_FW: 'FW'
};

export function Bench({ bench, players, onDrop, onRemove, onDragStart, onDragEnd, isDragging = false }: BenchProps) {
    const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
    const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);

    const getPlayerById = (playerId: string | null) => {
        if (!playerId) return null;
        return players.find(p => p.id === playerId);
    };

    const handleDragStart = (playerId: string, position: string) => {
        setDraggedPlayerId(playerId);
        onDragStart(playerId, position);
    };

    const handleDragEnd = () => {
        setDraggedPlayerId(null);
        setDragOverSlot(null);
        if (onDragEnd) {
            onDragEnd();
        }
    };

    const handleDragOver = (e: React.DragEvent, slot: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverSlot(slot);
    };

    const handleDragLeave = () => {
        setDragOverSlot(null);
    };

    const handleDrop = (e: React.DragEvent, slot: string) => {
        e.preventDefault();
        e.stopPropagation();
        const playerId = e.dataTransfer.getData('playerId') || draggedPlayerId;
        if (playerId) {
            onDrop(slot, playerId);
        }
        setDragOverSlot(null);
        setDraggedPlayerId(null);
    };

    const benchSlots = Object.keys(bench);

    return (
        <div className="mt-4 w-full max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-3 px-1">
                <Users size={14} className="text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Substitutes</span>
                <span className="text-[10px] text-slate-400">(Drag to reorder)</span>
            </div>

            <div className="flex gap-3 p-3 rounded-xl bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 shadow-xl">
                {benchSlots.map((slot, index) => {
                    const player = getPlayerById(bench[slot]);
                    const displayLabel = BENCH_DISPLAY_LABELS[slot] || slot;
                    const isOver = dragOverSlot === slot;

                    return (
                        <div
                            key={slot}
                            className="flex-1 flex flex-col items-center"
                        >
                            <div className={`
                                mb-2 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider
                                transition-all duration-200
                                ${isOver
                                    ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500/50'
                                    : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
                                }
                            `}>
                                {displayLabel}
                            </div>

                            <div
                                className="relative"
                                onDragOver={(e) => handleDragOver(e, slot)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, slot)}
                            >
                                {player ? (
                                    <PlayerCard
                                        player={player}
                                        position={displayLabel}
                                        isDragging={draggedPlayerId === player.id}
                                        onRemove={() => onRemove(slot)}
                                        onDragStart={() => handleDragStart(player.id, slot)}
                                        onDragEnd={handleDragEnd}
                                    />
                                ) : (
                                    <div
                                        className={`
                                            w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center
                                            transition-all duration-200
                                            ${isOver
                                                ? 'border-yellow-400 bg-yellow-400/20 scale-110'
                                                : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                                            }
                                            ${isDragging ? 'cursor-pointer' : ''}
                                        `}
                                        onDragOver={(e) => handleDragOver(e, slot)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, slot)}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <User size={20} className={isOver ? 'text-yellow-400' : 'text-slate-500'} />
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

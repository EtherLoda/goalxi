'use client';

import { Player } from '@/lib/api';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance, convertAppearance } from '@/utils/playerUtils';
import { X } from 'lucide-react';
import { useState } from 'react';

interface PlayerCardProps {
    player: Player;
    position: string;
    isSelected?: boolean;
    isDragging?: boolean;
    showStats?: boolean;
    onRemove?: () => void;
    onClick?: () => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}

export function PlayerCard({
    player,
    position,
    isSelected = false,
    isDragging = false,
    showStats = true,
    onRemove,
    onClick,
    onDragStart,
    onDragEnd
}: PlayerCardProps) {
    const [imageError, setImageError] = useState(false);

    const appearance = !imageError ? (convertAppearance(player.appearance) || generateAppearance(player.id)) : null;

    const shortName = player.name.split(' ').pop() || player.name;

    const staminaColor = player.stamina >= 4 ? 'bg-emerald-500'
        : player.stamina >= 2 ? 'bg-yellow-500'
            : 'bg-red-500';

    const formColor = player.form >= 4 ? 'bg-emerald-500'
        : player.form >= 2 ? 'bg-yellow-500'
            : 'bg-red-500';

    return (
        <div
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('playerId', player.id);
                e.stopPropagation();
                onDragStart?.();
            }}
            onDragEnd={(e) => {
                e.stopPropagation();
                onDragEnd?.();
            }}
            onClick={(e) => {
                e.stopPropagation();
                onClick?.();
            }}
            className={`
                relative flex items-center gap-1
                transition-all duration-200 ease-out
                ${isDragging ? 'opacity-40 scale-90' : 'hover:scale-105'}
                ${isSelected ? 'z-50' : 'z-10'}
            `}
        >
            {/* Stamina bar - left side (horizontal bars, battery style) */}
            {showStats && (
                <div className="flex flex-col gap-[2px] h-14 items-center">
                    {[5, 4, 3, 2, 1].map((level) => (
                        <div
                            key={`sta-${level}`}
                            className={`w-2.5 h-1.5 rounded-md ${
                                player.stamina >= level ? staminaColor : 'bg-slate-700'
                            }`}
                        />
                    ))}
                </div>
            )}

            {/* Main content - avatar + info below */}
            <div className="flex flex-col items-center">
                {/* Main avatar */}
                <div className={`
                    relative w-16 h-16 rounded-full
                    ${isSelected
                        ? 'ring-3 ring-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]'
                        : 'ring-2 ring-white/80 shadow-lg'
                    }
                    ${isDragging ? 'ring-2 ring-yellow-400' : ''}
                    overflow-hidden bg-gradient-to-b from-slate-700 to-slate-900
                `}>
                    {appearance && !imageError && (
                        <div className="absolute inset-0 flex items-center justify-center pt-1">
                            <MiniPlayer
                                appearance={appearance}
                                size={72}
                                onError={() => setImageError(true)}
                            />
                        </div>
                    )}

                    <div className={`
                        absolute inset-0 rounded-full
                        bg-black/60 opacity-0 group-hover:opacity-100
                        transition-opacity duration-150
                        flex items-center justify-center
                    `}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove?.();
                            }}
                            className="p-2 rounded-full bg-red-500/90 text-white hover:bg-red-600 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Position and Name - below avatar */}
                <div className={`
                    mt-1 px-2.5 py-1 rounded-lg min-w-[70px] text-center border
                    ${isSelected
                        ? 'bg-slate-800/90 border-yellow-400/50'
                        : 'bg-slate-900/90 border-white/10'
                    }
                `}>
                    <div className={`
                        text-[8px] font-bold uppercase tracking-wider
                        ${isSelected ? 'text-yellow-400' : 'text-emerald-400'}
                    `}>
                        {position}
                    </div>
                    <div className="text-[10px] font-semibold text-white leading-tight mt-0.5">
                        {shortName}
                    </div>
                </div>
            </div>

            {/* Form dots - right side */}
            {showStats && (
                <div className="flex flex-col gap-[2px] h-14 items-center">
                    {[5, 4, 3, 2, 1].map((level) => (
                        <div
                            key={`form-${level}`}
                            className={`w-1.5 h-1.5 rounded-full ${
                                player.form >= level ? formColor : 'bg-slate-700'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

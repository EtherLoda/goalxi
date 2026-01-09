import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, User } from 'lucide-react';
import { Player } from '@/lib/api';

interface PlayerSelectProps {
    value: string;
    onChange: (value: string) => void;
    players: Player[];
    placeholder?: string;
    className?: string;
    align?: 'left' | 'right';
    disabled?: boolean;
}

export function PlayerSelect({
    value,
    onChange,
    players,
    placeholder = "Select Player",
    className = "",
    align = 'left',
    disabled = false
}: PlayerSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedPlayer = players.find(p => p.id === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter players by name for quick search? (Maybe later. Simple list for now)

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all 
                ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900' : 'hover:border-blue-400 dark:hover:border-blue-500/50 hover:shadow-sm cursor-pointer'} 
                ${isOpen ? 'ring-2 ring-blue-500/20 border-blue-500' : ''}`}
            >
                {selectedPlayer ? (
                    <div className={`flex-1 flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'} overflow-hidden`}>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate w-full">
                            {selectedPlayer.name}
                        </span>
                        <div className={`flex items-center gap-1.5 mt-0.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {selectedPlayer.isGoalkeeper ? 'GK' : 'Outfielder'}
                            </span>
                            <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                            <span className={`text-[10px] font-bold ${selectedPlayer.overall >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                                OVR {selectedPlayer.overall}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                        <User size={14} />
                        <span className="text-xs font-medium">{placeholder}</span>
                    </div>
                )}
                {!disabled && (
                    <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
                )}
            </button>

            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        top: containerRef.current ? containerRef.current.getBoundingClientRect().bottom + 8 : 0,
                        left: containerRef.current ? (align === 'right'
                            ? containerRef.current.getBoundingClientRect().right - 240
                            : containerRef.current.getBoundingClientRect().left) : 0,
                        width: '240px',
                    }}
                    className={`z-[9999] max-h-[280px] overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 animate-in fade-in zoom-in-95 duration-100 flex flex-col`}
                >
                    <div className="p-1 space-y-0.5">
                        {players.map(player => (
                            <button
                                key={player.id}
                                onClick={() => {
                                    onChange(player.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all group ${value === player.id
                                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                                    }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold truncate">{player.name}</div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[9px] uppercase font-bold opacity-60 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                            {player.isGoalkeeper ? 'GK' : 'Outfielder'}
                                        </span>
                                        <span className={`text-[9px] font-bold ${player.overall >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                                            {player.overall}
                                        </span>
                                    </div>
                                </div>
                                {value === player.id && <Check size={14} className="text-blue-500 flex-shrink-0 ml-2" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

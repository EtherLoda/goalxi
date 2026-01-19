'use client';

import { Player } from '@/lib/api';
import { X } from 'lucide-react';
import { generateAppearance } from '@/utils/playerUtils';
import { useState, useRef, useCallback } from 'react';
import { PlayerCard } from './PlayerCard';

// Position coordinates on the pitch (FM style)
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
    CFL: { x: 30, y: 15 }, CF: { x: 50, y: 10 }, CFR: { x: 70, y: 15 },
    LW: { x: 8, y: 18 }, RW: { x: 92, y: 18 },
    AML: { x: 30, y: 28 }, AM: { x: 50, y: 25 }, AMR: { x: 70, y: 28 },
    LM: { x: 8, y: 42 }, RM: { x: 92, y: 42 },
    CML: { x: 32, y: 44 }, CM: { x: 50, y: 42 }, CMR: { x: 68, y: 44 },
    DML: { x: 32, y: 58 }, DM: { x: 50, y: 56 }, DMR: { x: 68, y: 58 },
    WBL: { x: 8, y: 64 }, WBR: { x: 92, y: 64 },
    LB: { x: 8, y: 74 }, RB: { x: 92, y: 74 },
    CDL: { x: 34, y: 74 }, CD: { x: 50, y: 77 }, CDR: { x: 66, y: 74 },
    GK: { x: 50, y: 92 },
};

interface PitchLayoutProps {
    lineup: Record<string, string | null>;
    players: Player[];
    onDrop: (position: string, playerId: string) => void;
    onRemove: (position: string) => void;
    onDragStart: (playerId: string, position: string) => void;
    onDragEnd?: () => void;
    isDragging?: boolean;
}

export function PitchLayout({ lineup, players, onDrop, onRemove, onDragStart, onDragEnd, isDragging = false }: PitchLayoutProps) {
    const [dragOverPosition, setDragOverPosition] = useState<string | null>(null);
    const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
    const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const getPlayerById = useCallback((playerId: string | null) => {
        if (!playerId) return null;
        return players.find(p => p.id === playerId);
    }, [players]);

    // Generate connections between players (FM style - show team shape)
    const getConnections = useCallback(() => {
        const connections: { from: string; to: string }[] = [];
        const positions = Object.keys(lineup).filter(p => lineup[p]);

        // Connect goalkeeper to nearest defender
        if (lineup.GK && lineup.CD) connections.push({ from: 'GK', to: 'CD' });
        if (lineup.CD && lineup.CDL) connections.push({ from: 'CD', to: 'CDL' });
        if (lineup.CD && lineup.CDR) connections.push({ from: 'CD', to: 'CDR' });

        // Connect back line
        if (lineup.CDL && lineup.LB) connections.push({ from: 'CDL', to: 'LB' });
        if (lineup.CDR && lineup.RB) connections.push({ from: 'CDR', to: 'RB' });

        // Connect midfield
        if (lineup.CM && lineup.CML) connections.push({ from: 'CM', to: 'CML' });
        if (lineup.CM && lineup.CMR) connections.push({ from: 'CM', to: 'CMR' });

        return connections;
    }, [lineup]);

    const handleDragStart = (playerId: string, position: string) => {
        setDraggedPlayerId(playerId);
        onDragStart(playerId, position);
    };

    const handleDragEnd = () => {
        setDraggedPlayerId(null);
        setDragOverPosition(null);
        onDragEnd?.();
    };

    const handleDragOver = (e: React.DragEvent, position: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverPosition(position);
    };

    const handleDragLeave = () => {
        setDragOverPosition(null);
    };

    const handleDrop = (e: React.DragEvent, position: string) => {
        e.preventDefault();
        e.stopPropagation();

        // Get playerId from dataTransfer (for cross-component drag) or state (for internal drag)
        const playerId = e.dataTransfer.getData('playerId') || draggedPlayerId;

        if (playerId) {
            onDrop(position, playerId);
        }

        setDragOverPosition(null);
        setDraggedPlayerId(null);
    };

    const renderPositionMarker = (position: string, coords: { x: number; y: number }) => {
        const isOver = dragOverPosition === position;
        const player = getPlayerById(lineup[position]);

        return (
            <div
                key={position}
                className="absolute z-10 transition-all duration-200"
                style={{
                    left: `${coords.x}%`,
                    top: `${coords.y}%`,
                    transform: 'translate(-50%, -50%)',
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverPosition(position);
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverPosition(null);
                    }
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const playerId = e.dataTransfer.getData('playerId') || draggedPlayerId;
                    if (playerId) {
                        onDrop(position, playerId);
                    }
                    setDragOverPosition(null);
                    setDraggedPlayerId(null);
                }}
            >
                {/* Position marker circle (shown only when dragging) */}
                {!player && draggedPlayerId && (
                    <div className={`
                        absolute inset-0 w-16 h-16 -mt-8 -ml-8 rounded-full
                        border-2 border-dashed transition-all duration-200
                        ${isOver
                            ? 'border-yellow-400 bg-yellow-400/20 scale-110'
                            : 'border-white/30 hover:border-white/50 hover:bg-white/10'
                        }
                    `}>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white/70">{position}</span>
                        </div>
                    </div>
                )}

                {/* Player card (FM style) */}
                {player && (
                    <PlayerCard
                        player={player}
                        position={position}
                        isSelected={selectedPosition === position}
                        isDragging={draggedPlayerId === player.id}
                        onRemove={() => onRemove(position)}
                        onClick={() => setSelectedPosition(
                            selectedPosition === position ? null : position
                        )}
                        onDragStart={() => handleDragStart(player.id, position)}
                        onDragEnd={handleDragEnd}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="relative w-full max-w-4xl mx-auto">
            {/* Pitch container */}
            <div
                className="relative aspect-[3/4] rounded-xl overflow-hidden shadow-2xl"
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const playerId = e.dataTransfer.getData('playerId');
                    if (playerId) {
                        // Find closest position or use default
                        onDrop('CM', playerId); // Default to CM position
                    }
                }}
            >
                {/* Grass background with gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-800" />

                {/* Grass stripes pattern */}
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_40px,rgba(0,0,0,0.1)_40px,rgba(0,0,0,0.1)_80px)]" />
                </div>

                {/* Pitch markings */}
                <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
                    {/* Center circle */}
                    <circle cx="50%" cy="50%" r="8" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
                    <circle cx="50%" cy="50%" r="1" fill="rgba(255,255,255,0.6)" />

                    {/* Center line */}
                    <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />

                    {/* Penalty areas */}
                    <path d="M 0 100 L 35 100 L 35 75 L 65 75 L 65 100 L 100 100" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
                    <path d="M 0 0 L 35 0 L 35 25 L 65 25 L 65 0 L 100 0" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />

                    {/* Goal areas */}
                    <path d="M 0 100 L 45 100 L 45 88 L 55 88 L 55 100 L 100 100" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />
                    <path d="M 0 0 L 45 0 L 45 12 L 55 12 L 55 0 L 100 0" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" />

                    {/* Corner arcs */}
                    <path d="M 0 2 Q 2 2 2 0" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
                    <path d="M 100 2 Q 98 2 98 0" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
                    <path d="M 0 98 Q 2 98 2 100" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
                    <path d="M 100 98 Q 98 98 98 100" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />

                    {/* Penalty spots */}
                    <circle cx="50%" cy="88%" r="0.5" fill="rgba(255,255,255,0.6)" />
                    <circle cx="50%" cy="12%" r="0.5" fill="rgba(255,255,255,0.6)" />

                    {/* Team shape connections */}
                    {getConnections().map((conn, i) => {
                        const from = POSITION_COORDS[conn.from];
                        const to = POSITION_COORDS[conn.to];
                        if (!from || !to) return null;
                        return (
                            <line
                                key={i}
                                x1={`${from.x}%`}
                                y1={`${from.y}%`}
                                x2={`${to.x}%`}
                                y2={`${to.y}%`}
                                stroke="rgba(255,255,255,0.2)"
                                strokeWidth="1"
                                strokeDasharray="4 4"
                            />
                        );
                    })}
                </svg>

                {/* Position slots */}
                <div className="absolute inset-0">
                    {Object.entries(POSITION_COORDS).map(([position, coords]) =>
                        renderPositionMarker(position, coords)
                    )}
                </div>

                {/* Pitch border */}
                <div className="absolute inset-0 border-4 border-emerald-900/50 pointer-events-none" />
            </div>

            {/* Formation name display */}
            <div className="absolute top-4 left-4 px-4 py-2 bg-slate-900/90 backdrop-blur-sm rounded-lg">
                <span className="text-white font-bold">
                    {(() => {
                        const defenders = ['CDL', 'CD', 'CDR', 'LB', 'RB', 'WBL', 'WBR'].filter(p => lineup[p]).length;
                        const midfielders = ['DML', 'DM', 'DMR', 'CML', 'CM', 'CMR', 'LM', 'RM'].filter(p => lineup[p]).length;
                        const attackers = ['AML', 'AM', 'AMR', 'LW', 'RW', 'CFL', 'CF', 'CFR'].filter(p => lineup[p]).length;
                        return `${defenders}-${midfielders}-${attackers}`;
                    })()}
                </span>
            </div>
        </div>
    );
}

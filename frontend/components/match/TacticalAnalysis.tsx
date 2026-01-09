import Link from 'next/link';
import { MiniPlayer } from '@/components/MiniPlayer';
import { PlayerState, TeamSnapshot } from '@/lib/api';
import { generateAppearance } from '@/utils/playerUtils';
import { ExternalLink, Grid3x3, Shield, Swords, Target, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import React, { useState, Fragment, useRef, useEffect } from 'react';
import styles from './MatchComponents.module.css';

interface TacticalAnalysisProps {
    homeSnapshot: TeamSnapshot | null;
    awaySnapshot: TeamSnapshot | null;
    homeTeamName: string;
    awayTeamName: string;
    initialStamina?: Map<string, number>;
}

// Convert numbered positions to directional names for display
function formatPositionName(position: string): string {
    const positionMap: Record<string, string> = {
        'CB1': 'CBL', 'CB2': 'CB', 'CB3': 'CBR',
        'DMF1': 'DML', 'DMF2': 'DM', 'DMF3': 'DMR',
        'DMF': 'DM', 'CDM': 'DM',
        'CM1': 'CML', 'CM2': 'CM', 'CM3': 'CMR',
        'CAM1': 'AML', 'CAM2': 'AM', 'CAM3': 'AMR',
        'CAM': 'AM',
        'ST': 'CF',
        'CF_L': 'CFL', 'CF_R': 'CFR',
    };
    return positionMap[position] || position;
}

// Position coordinates for the pitch
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
    GK: { x: 5, y: 50 },
    LB: { x: 15, y: 12 }, CBL: { x: 15, y: 32 }, CB: { x: 15, y: 50 }, CBR: { x: 15, y: 68 }, RB: { x: 15, y: 88 },
    CB1: { x: 15, y: 32 }, CB2: { x: 15, y: 50 }, CB3: { x: 15, y: 68 },
    LWB: { x: 20, y: 12 }, WB: { x: 20, y: 50 }, WBR: { x: 20, y: 68 }, RWB: { x: 20, y: 88 },
    DML: { x: 25, y: 32 }, DM: { x: 25, y: 50 }, DMR: { x: 25, y: 68 }, CDM: { x: 25, y: 50 },
    DMF1: { x: 25, y: 32 }, DMF2: { x: 25, y: 50 }, DMF3: { x: 25, y: 68 },
    LM: { x: 30, y: 12 }, CML: { x: 30, y: 32 }, CM: { x: 30, y: 50 }, CMR: { x: 30, y: 68 }, RM: { x: 30, y: 88 },
    CM1: { x: 30, y: 32 }, CM2: { x: 30, y: 50 }, CM3: { x: 30, y: 68 },
    AML: { x: 37, y: 32 }, AM: { x: 37, y: 50 }, AMR: { x: 37, y: 68 }, CAM: { x: 37, y: 50 },
    CAM1: { x: 37, y: 32 }, CAM2: { x: 37, y: 50 }, CAM3: { x: 37, y: 68 },
    LW: { x: 45, y: 12 }, CFL: { x: 45, y: 32 }, CF: { x: 45, y: 50 }, CFR: { x: 45, y: 68 }, ST: { x: 45, y: 50 }, RW: { x: 45, y: 88 },
};

interface PlayerCardProps {
    player: PlayerState;
    isHome: boolean;
    homeTeamName: string;
    awayTeamName: string;
    initialStamina?: number;
    gkRating?: number; // GK rating from TeamSnapshot
    y: number; // Y coordinate on pitch (0-100)
}

function PlayerCard({ player, isHome, homeTeamName, awayTeamName, initialStamina, gkRating, y }: PlayerCardProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [lockProgress, setLockProgress] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const appearance = generateAppearance(player.playerId);

    const isGK = player.position === 'GK';
    const performance = isGK
        ? Math.round(gkRating || 0)
        : Math.round((player.positionalContribution ?? 0) * (player.conditionMultiplier ?? 1));

    const currentStamina = player.stamina;
    const staminaPercent = initialStamina ? (currentStamina / initialStamina) * 100 : 100;
    const displayPosition = formatPositionName(player.position);
    const teamName = isHome ? homeTeamName : awayTeamName;

    useEffect(() => {
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        };
    }, []);

    const handleMouseEnter = () => {
        setIsHovered(true);
        if (!isLocked) {
            setLockProgress(0);
            const startTime = Date.now();
            const duration = 1500;

            progressIntervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min((elapsed / duration) * 100, 100);
                setLockProgress(progress);
                if (progress >= 100) {
                    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
                }
            }, 50);

            timerRef.current = setTimeout(() => {
                setIsLocked(true);
                setLockProgress(0);
            }, duration);
        }
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
        setLockProgress(0);
    };

    const getStaminaColor = () => {
        if (staminaPercent >= 70) return 'bg-emerald-500';
        if (staminaPercent >= 40) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div
            className="group cursor-pointer relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Player Pin/Avatar */}
            <div className={`${styles.playerAvatar} ${isHome ? styles.playerAvatarHome : styles.playerAvatarAway}`}>
                <div className="mt-2 text-white/90">
                    <MiniPlayer appearance={appearance} size={48} />
                </div>

                {/* Badge for Subs (entryMinute > 0) */}
                {player.entryMinute > 0 && (
                    <div
                        className="absolute -top-1 -right-1 bg-emerald-500 rounded-full p-1 border border-white shadow-sm"
                        title={`Subbed in at ${player.entryMinute}'`}
                    >
                        <Users className="w-3 h-3 text-white" />
                    </div>
                )}
            </div>

            {/* Always-visible Mini Info */}
            <div className="mt-1 flex flex-col items-center gap-0.5">
                {/* Name Tag */}
                <div className="bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/20 w-[64px] shadow-lg relative overflow-hidden">
                    <div className="text-[9px] font-bold text-white truncate text-center leading-tight mb-0.5">
                        {player.name.split(' ').pop()}
                    </div>
                    {/* Tiny Stamina Bar */}
                    <div className="h-0.5 bg-white/20 rounded-full overflow-hidden">
                        <div className={`h-full ${getStaminaColor()}`} style={{ width: `${staminaPercent}%` }} />
                    </div>
                </div>

                {/* Performance Badge (Floating over avatar) */}
                <div className="absolute top-0 -right-2 bg-yellow-500 text-black text-[10px] font-black px-1 rounded shadow-md border border-white z-30 scale-90 group-hover:scale-100 transition-transform">
                    {performance}
                </div>
            </div>

            {/* Player Info Tooltip (Premium Glassmorphic) */}
            <div className={`${styles.playerCardTooltip} ${isHovered ? styles.visibleTooltip : ''} ${isLocked ? styles.lockedTooltip : ''} ${y < 25 ? styles.tooltipBottom : ''}`}>
                <div className={`${styles.playerCardInfo} p-3 rounded-xl border border-white/20 shadow-2xl overflow-hidden relative`}>
                    {/* Locking Progress Bar (Top) */}
                    {!isLocked && lockProgress > 0 && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10">
                            <div
                                className="h-full bg-emerald-400 transition-all duration-75"
                                style={{ width: `${lockProgress}%` }}
                            />
                        </div>
                    )}

                    <div className="flex justify-between items-start mb-2">
                        <div className="max-w-[140px]">
                            <div className="text-xs font-black text-white leading-tight uppercase tracking-wide truncate">
                                {player.name}
                            </div>
                            <div className="text-[9px] text-emerald-400 font-bold uppercase mt-0.5 truncate">
                                {teamName}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="px-1.5 py-0.5 bg-black/40 rounded text-[10px] font-mono border border-white/10">
                                    {player.entryMinute > 0 ? `Sub In: ${player.entryMinute}'` : 'Starter'}
                                </div>
                            </div>
                        </div>
                        {isLocked && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsLocked(false); }}
                                className="p-1 hover:bg-white/10 rounded-full transition-colors ml-1"
                                title="Close tooltip"
                            >
                                <X size={14} className="text-white/60" />
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white/5 rounded-lg p-1.5 border border-white/10">
                            <div className="text-[8px] uppercase text-gray-400 font-bold mb-0.5">Pos</div>
                            <div className="text-[10px] font-black text-white">{displayPosition}</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-1.5 border border-white/10">
                            <div className="text-[8px] uppercase text-gray-400 font-bold mb-0.5">Rating</div>
                            <div className="text-[10px] font-black text-yellow-400">{player.overall}</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-1.5 border border-white/10">
                            <div className="text-[8px] uppercase text-gray-400 font-bold mb-0.5">Age</div>
                            <div className="text-[10px] font-black text-blue-300">{player.age},{player.ageDays}</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-1.5 border border-white/10">
                            <div className="text-[8px] uppercase text-gray-400 font-bold mb-0.5">Form</div>
                            <div className="text-[10px] font-black text-purple-300">{player.form}</div>
                        </div>
                    </div>

                    <div className="space-y-1 mb-3">
                        <div className="flex justify-between items-center text-[9px] font-bold">
                            <span className="text-gray-400 uppercase">Stamina</span>
                            <span className="text-white">{Math.round(staminaPercent)}%</span>
                        </div>
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <div className={`h-full ${getStaminaColor()} transition-all duration-300`} style={{ width: `${staminaPercent}%` }} />
                        </div>
                    </div>

                    <Link
                        href={`/players/${player.playerId}`}
                        className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-[10px] font-black text-white uppercase tracking-widest transition-all hover:shadow-lg hover:shadow-emerald-500/20"
                    >
                        View Details <ExternalLink size={10} />
                    </Link>
                </div>
            </div>
        </div>
    );
}

export function TacticalAnalysis({ homeSnapshot, awaySnapshot, homeTeamName, awayTeamName, initialStamina }: TacticalAnalysisProps) {
    const [viewMode, setViewMode] = useState<'formation' | 'tactical'>('formation');

    if (!homeSnapshot || !awaySnapshot) {
        return null;
    }

    const homeLanes = homeSnapshot.laneStrengths;
    const awayLanes = awaySnapshot.laneStrengths;
    const homePlayers = homeSnapshot.players || [];
    const awayPlayers = awaySnapshot.players || [];

    const calculateWinPercentage = (homeValue: number, awayValue: number, k: number = 0.025) => {
        if (homeValue === 0 && awayValue === 0) return { home: 50, away: 50, dominant: 'draw' };
        const diff = homeValue - awayValue;
        const homeProb = 1 / (1 + Math.exp(-diff * k));
        const homePercent = Math.round(homeProb * 100);
        return {
            home: homePercent,
            away: 100 - homePercent,
            dominant: Math.abs(homePercent - 50) < 3 ? 'draw' : (homePercent > 50 ? 'home' : 'away')
        };
    };

    const getZoneColor = (result: any) => {
        if (result.dominant === 'home') return `rgba(110, 205, 234, ${Math.min(result.home / 150, 0.7)})`;
        if (result.dominant === 'away') return `rgba(209, 94, 94, ${Math.min(result.away / 150, 0.7)})`;
        return 'rgba(148, 163, 184, 0.3)';
    };

    const homePositionMap: Record<string, PlayerState> = {};
    homePlayers.forEach(player => {
        homePositionMap[player.position] = player;
        // Also map to formatted name for compatibility with POSITION_COORDS keys like 'CFL'
        const formatted = formatPositionName(player.position);
        if (formatted !== player.position) homePositionMap[formatted] = player;
    });

    const awayPositionMap: Record<string, PlayerState> = {};
    awayPlayers.forEach(player => {
        awayPositionMap[player.position] = player;
        const formatted = formatPositionName(player.position);
        if (formatted !== player.position) awayPositionMap[formatted] = player;
    });

    const battleZones = [
        { name: 'HOME END', sub: 'Def vs Atk', h: homeLanes.left.defense, a: awayLanes.left.attack, k: 0.025 },
        { name: 'MIDFIELD', sub: 'Possession', h: homeLanes.left.possession, a: awayLanes.left.possession, k: 0.02 },
        { name: 'AWAY END', sub: 'Atk vs Def', h: homeLanes.left.attack, a: awayLanes.left.defense, k: 0.025 },
        { name: 'HOME END', sub: 'Def vs Atk', h: homeLanes.center.defense, a: awayLanes.center.attack, k: 0.025 },
        { name: 'MIDFIELD', sub: 'Possession', h: homeLanes.center.possession, a: awayLanes.center.possession, k: 0.02 },
        { name: 'AWAY END', sub: 'Atk vs Def', h: homeLanes.center.attack, a: awayLanes.center.defense, k: 0.025 },
        { name: 'HOME END', sub: 'Def vs Atk', h: homeLanes.right.defense, a: awayLanes.right.attack, k: 0.025 },
        { name: 'MIDFIELD', sub: 'Possession', h: homeLanes.right.possession, a: awayLanes.right.possession, k: 0.02 },
        { name: 'AWAY END', sub: 'Atk vs Def', h: homeLanes.right.attack, a: awayLanes.right.defense, k: 0.025 },
    ];

    return (
        <div className="rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white dark:bg-emerald-950/20 shadow-lg overflow-hidden">
            <div className="p-5 border-b-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white/80 dark:bg-emerald-950/40 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                        <Target size={20} /> Match Analysis
                    </h3>
                    <div className="flex items-center gap-2">
                        {[
                            { id: 'formation', icon: <Users size={16} />, label: 'Players' },
                            { id: 'tactical', icon: <Grid3x3 size={16} />, label: 'Tactical' }
                        ].map(mode => (
                            <button
                                key={mode.id}
                                onClick={() => setViewMode(mode.id as any)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${viewMode === mode.id ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white dark:bg-emerald-900/40 text-slate-600 dark:text-emerald-400'}`}
                            >
                                {mode.icon} {mode.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="p-6">
                <div className="relative w-full aspect-[16/7] rounded-xl border-4 border-white/30 shadow-2xl bg-gradient-to-br from-[#2d5016] via-[#3a6b1f] to-[#2d5016] dark:from-[#1a3d0f] dark:via-[#2d5016] dark:to-[#1a3d0f] overflow-hidden">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_4%,rgba(0,0,0,0.03)_4%,rgba(0,0,0,0.03)_8%)] pointer-events-none" />
                    <div className="absolute inset-0 opacity-50 pointer-events-none">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-white" />
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white" />
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[16%] h-[60%] border-2 border-white border-l-0" />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[16%] h-[60%] border-2 border-white border-r-0" />
                    </div>

                    {viewMode === 'formation' ? (
                        <>
                            {Object.entries(POSITION_COORDS).map(([pos, coords]) => {
                                const hp = homePositionMap[pos];
                                const ap = awayPositionMap[pos];
                                return (
                                    <Fragment key={pos}>
                                        {hp && <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${coords.x}%`, top: `${coords.y}%` }}><PlayerCard player={hp} isHome={true} homeTeamName={homeTeamName} awayTeamName={awayTeamName} initialStamina={initialStamina?.get(hp.playerId)} gkRating={homeSnapshot.gkRating} y={coords.y} /></div>}
                                        {ap && <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${100 - coords.x}%`, top: `${coords.y}%` }}><PlayerCard player={ap} isHome={false} homeTeamName={homeTeamName} awayTeamName={awayTeamName} initialStamina={initialStamina?.get(ap.playerId)} gkRating={awaySnapshot.gkRating} y={coords.y} /></div>}
                                    </Fragment>
                                );
                            })}
                        </>
                    ) : (
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1 p-2">
                            {battleZones.map((z, idx) => {
                                const res = calculateWinPercentage(z.h, z.a, z.k);
                                return (
                                    <div key={idx} className="relative rounded-lg border-2 border-white/40 overflow-hidden backdrop-blur-sm transition-all hover:scale-105" style={{ background: getZoneColor(res) }}>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                                            <div className="text-[9px] font-bold text-white/90 uppercase tracking-wide">{z.name}</div>
                                            <div className="text-[7px] font-medium text-white/60 mb-1">{z.sub}</div>
                                            <div className="text-xl sm:text-2xl font-black text-white">{res.dominant === 'home' ? res.home : res.dominant === 'away' ? res.away : 50}%</div>
                                            <div className="text-[8px] font-mono text-white/70 mt-1">{z.h.toFixed(0)}:{z.a.toFixed(0)}</div>
                                        </div>
                                        {res.dominant !== 'draw' && <div className="absolute top-1 right-1 text-white"><TrendingUp size={12} /></div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {viewMode === 'tactical' && (
                    <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                        <div className="flex items-center gap-2 font-black uppercase tracking-wider" style={{ color: '#6ECDEA' }}>
                            <div className="w-3 h-3 rounded-full shadow-[0_0_8px_#6ECDEA66]" style={{ backgroundColor: '#6ECDEA' }} />
                            {homeTeamName}
                        </div>
                        <div className="flex items-center gap-2 font-black uppercase tracking-wider" style={{ color: '#D15E5E' }}>
                            {awayTeamName}
                            <div className="w-3 h-3 rounded-full shadow-[0_0_8px_#D15E5E66]" style={{ backgroundColor: '#D15E5E' }} />
                        </div>
                        <div className="flex items-center gap-4 ml-6 pl-6 border-l border-white/10 opacity-60">
                            {[{ i: <Shield size={14} />, l: 'DEF' }, { i: <Target size={14} />, l: 'POS' }, { i: <Swords size={14} />, l: 'ATK' }].map((leg, i) => (
                                <div key={i} className="flex items-center gap-1 font-bold">{leg.i} {leg.l}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

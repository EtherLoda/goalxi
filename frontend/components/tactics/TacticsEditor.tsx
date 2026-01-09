'use client';

import { useState, useEffect } from 'react';
import { Player, api } from '@/lib/api';
import { PitchLayout } from './PitchLayout';
import { PlayerRoster } from './PlayerRoster';
import { Save, Lock, Clock, Plus, Trash2, ArrowRightLeft, UserMinus, UserPlus, Move } from 'lucide-react';
import { useNotification } from '@/components/ui/NotificationContext';
import { PlayerSelect } from '@/components/ui/PlayerSelect';
import { PositionSelect } from '@/components/ui/PositionSelect';

interface TacticalEvent {
    minute: number;
    type: 'sub' | 'move';
    playerA: string; // Out (sub) or Player (move)
    playerB: string; // In (sub) or New Position (move)
}

interface TacticsEditorProps {
    matchId: string;
    teamId: string;
    players: Player[];
    initialTactics: any;
    matchScheduledAt: string; // ISO date string
    matchStatus: string;
}

const POSITIONS = [
    'GK', 'CD', 'CDL', 'CDR', 'LB', 'RB', 'WBL', 'WBR',
    'DM', 'DML', 'DMR', 'CM', 'CML', 'CMR', 'LM', 'RM',
    'AM', 'AML', 'AMR', 'LW', 'RW', 'CF', 'CFR', 'CFL'
];

const SLOT_MAPPING: Record<string, string> = {
    GK: 'GK',
    CDL: 'CB1', CD: 'CB2', CDR: 'CB3',
    LB: 'LB', RB: 'RB',
    WBL: 'LWB', WBR: 'RWB',
    DML: 'DMF1', DM: 'DMF2', DMR: 'DMF3',
    CML: 'CM1', CM: 'CM2', CMR: 'CM3',
    LM: 'LM', RM: 'RM',
    AML: 'CAM1', AM: 'CAM2', AMR: 'CAM3',
    LW: 'LW', RW: 'RW',
    CFL: 'CFL', CF: 'CF', CFR: 'CFR'
};

const BACKEND_TO_FRONTEND: Record<string, string> = Object.entries(SLOT_MAPPING)
    .reduce((acc, [front, back]) => ({ ...acc, [back]: front }), {});

// Add direct mappings for backend positions
BACKEND_TO_FRONTEND['GK'] = 'GK';
BACKEND_TO_FRONTEND['LB'] = 'LB';
BACKEND_TO_FRONTEND['CB'] = 'CD';
BACKEND_TO_FRONTEND['CBL'] = 'CDL';
BACKEND_TO_FRONTEND['CBR'] = 'CDR';
BACKEND_TO_FRONTEND['RB'] = 'RB';
BACKEND_TO_FRONTEND['DMF'] = 'DM';
BACKEND_TO_FRONTEND['DML'] = 'DML';
BACKEND_TO_FRONTEND['DMR'] = 'DMR';
BACKEND_TO_FRONTEND['CAM'] = 'AM';
BACKEND_TO_FRONTEND['AML'] = 'AML';
BACKEND_TO_FRONTEND['AM'] = 'AM';
BACKEND_TO_FRONTEND['AMR'] = 'AMR';
BACKEND_TO_FRONTEND['CF'] = 'CF';
BACKEND_TO_FRONTEND['ST'] = 'CF';
BACKEND_TO_FRONTEND['CFL'] = 'CFL';
BACKEND_TO_FRONTEND['CFR'] = 'CFR';
BACKEND_TO_FRONTEND['LM'] = 'LM';
BACKEND_TO_FRONTEND['RM'] = 'RM';
BACKEND_TO_FRONTEND['CML'] = 'CML';
BACKEND_TO_FRONTEND['CMR'] = 'CMR';

export function TacticsEditor({ matchId, teamId, players, initialTactics, matchScheduledAt, matchStatus }: TacticsEditorProps) {
    const [lineup, setLineup] = useState<Record<string, string | null>>(() => {
        const initial: Record<string, string | null> = {};
        POSITIONS.forEach(pos => initial[pos] = null);

        if (initialTactics?.lineup) {
            Object.entries(initialTactics.lineup).forEach(([slot, playerId]) => {
                const frontendSlot = BACKEND_TO_FRONTEND[slot];
                if (frontendSlot && POSITIONS.includes(frontendSlot)) {
                    initial[frontendSlot] = playerId as string;
                }
            });
        }

        return initial;
    });

    const [tacticalEvents, setTacticalEvents] = useState<TacticalEvent[]>(() => {
        const events: TacticalEvent[] = [];

        if (initialTactics?.substitutions) {
            initialTactics.substitutions.forEach((sub: any) => {
                events.push({
                    minute: sub.minute,
                    type: 'sub',
                    playerA: sub.out,
                    playerB: sub.in
                });
            });
        }

        if (initialTactics?.instructions?.moves) {
            initialTactics.instructions.moves.forEach((move: any) => {
                events.push({
                    minute: move.minute,
                    type: 'move',
                    playerA: move.player,
                    playerB: move.position
                });
            });
        }

        return events;
    });

    const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);
    const [draggedFrom, setDraggedFrom] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isTacticsLocked, setIsTacticsLocked] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const { showNotification } = useNotification();

    // Check tactics lock status and countdown
    useEffect(() => {
        const checkLockStatus = () => {
            if (matchStatus !== 'scheduled') {
                setIsTacticsLocked(true);
                setCountdown(null);
                return;
            }

            const now = Date.now();
            const matchStartTime = new Date(matchScheduledAt).getTime();
            const timeUntilMatchStart = matchStartTime - now;
            const LOCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

            if (timeUntilMatchStart <= LOCK_THRESHOLD_MS) {
                setIsTacticsLocked(true);
                setCountdown(Math.max(0, Math.floor(timeUntilMatchStart / 1000)));
                return;
            }

            setIsTacticsLocked(false);
            const timeUntilLock = timeUntilMatchStart - LOCK_THRESHOLD_MS;
            setCountdown(Math.max(0, Math.floor(timeUntilLock / 1000)));
        };

        checkLockStatus();
        const interval = setInterval(checkLockStatus, 1000);
        return () => clearInterval(interval);
    }, [matchScheduledAt, matchStatus]);

    const handleDragStart = (playerId: string, from: string | null) => {
        setDraggedPlayer(playerId);
        setDraggedFrom(from);
    };

    const handleDragEnd = () => {
        setDraggedPlayer(null);
        setDraggedFrom(null);
    };

    const handleDrop = (position: string) => {
        if (!draggedPlayer) return;

        const player = players.find(p => p.id === draggedPlayer);
        if (!player) return;

        if (position === 'GK') {
            if (!player.isGoalkeeper) {
                showNotification({ type: 'warning', title: 'Invalid Position', message: 'Only goalkeepers can be placed in the GK position.' });
                setDraggedPlayer(null);
                setDraggedFrom(null);
                return;
            }
        }

        if (player.isGoalkeeper && position !== 'GK') {
            showNotification({ type: 'warning', title: 'Invalid Position', message: 'Goalkeepers can only be placed in the GK position.' });
            setDraggedPlayer(null);
            setDraggedFrom(null);
            return;
        }

        const newLineup = { ...lineup };
        if (draggedFrom) newLineup[draggedFrom] = null;
        newLineup[position] = draggedPlayer;

        setLineup(newLineup);
        setDraggedPlayer(null);
        setDraggedFrom(null);
    };

    const handleRemovePlayer = (position: string) => {
        const playerId = lineup[position];
        setLineup(prev => ({ ...prev, [position]: null }));

        if (playerId) {
            setTacticalEvents(prev => prev.filter(e => e.playerA !== playerId && e.playerB !== playerId));
        }
    };

    const handleAddEvent = () => {
        // Initialize with empty values, requiring user selection
        setTacticalEvents(prev => [
            ...prev,
            {
                minute: 60,
                type: 'sub',
                playerA: '',
                playerB: ''
            }
        ]);
    };

    const handleUpdateEvent = (index: number, updates: Partial<TacticalEvent>) => {
        const current = tacticalEvents[index];
        const updated = { ...current, ...updates };

        // 1. Type Switch Reset
        if (updates.type && updates.type !== current.type) {
            setTacticalEvents(prev => {
                const next = [...prev];
                next[index] = { ...updated, playerA: '', playerB: '' };
                return next;
            });
            return;
        }

        // 2. Validation
        if (updated.type === 'sub') {
            // If changing B (In Player), check compatibility with A
            if (updates.playerB && updated.playerA) {
                const pA = players.find(p => p.id === updated.playerA);
                const pB = players.find(p => p.id === updates.playerB);
                if (pA && pB && pA.isGoalkeeper !== pB.isGoalkeeper) {
                    showNotification({ type: 'error', title: 'Invalid Substitution', message: pA.isGoalkeeper ? 'Goalkeepers must be replaced by another Goalkeeper.' : 'Outfielders cannot be replaced by a Goalkeeper.' });
                    return; // Block update
                }
            }
            // If changing A (Out Player), check compatibility with B (if exists)
            if (updates.playerA && updated.playerB) {
                const pA = players.find(p => p.id === updates.playerA);
                const pB = players.find(p => p.id === updated.playerB);
                if (pA && pB && pA.isGoalkeeper !== pB.isGoalkeeper) {
                    // Auto-clear B
                    setTacticalEvents(prev => {
                        const next = [...prev];
                        next[index] = { ...updated, playerB: '' };
                        return next;
                    });
                    return;
                }
            }
        }

        if (updated.type === 'move') {
            // If changing B (Position), check if = A's position
            if (updates.playerB && updated.playerA) {
                const currentPos = Object.entries(lineup).find(([_, pid]) => pid === updated.playerA)?.[0];
                if (currentPos === updates.playerB) {
                    showNotification({ type: 'warning', title: 'Invalid Move', message: 'Cannot move a player to their current position.' });
                    return; // Block
                }
            }
            // If changing A, check if matches B
            if (updates.playerA && updated.playerB) {
                const currentPos = Object.entries(lineup).find(([_, pid]) => pid === updates.playerA)?.[0];
                if (currentPos === updated.playerB) {
                    // Auto-clear B
                    setTacticalEvents(prev => {
                        const next = [...prev];
                        next[index] = { ...updated, playerB: '' };
                        return next;
                    });
                    return;
                }
            }
        }

        setTacticalEvents(prev => {
            const next = [...prev];
            next[index] = updated;
            return next;
        });
    };

    const handleRemoveEvent = (index: number) => {
        setTacticalEvents(prev => prev.filter((_, i) => i !== index));
    };

    const validateLineup = (): { valid: boolean; error?: string } => {
        const assignedPlayers = Object.values(lineup).filter(Boolean);
        const playerCount = assignedPlayers.length;

        if (!lineup.GK) return { valid: false, error: 'Goalkeeper is required' };
        const gkPlayer = players.find(p => p.id === lineup.GK);
        if (gkPlayer && !gkPlayer.isGoalkeeper) return { valid: false, error: 'Only a goalkeeper can play in GK position' };

        for (const [position, playerId] of Object.entries(lineup)) {
            if (position !== 'GK' && playerId) {
                const player = players.find(p => p.id === playerId);
                if (player?.isGoalkeeper) return { valid: false, error: 'Goalkeepers can only play in GK position' };
            }
        }

        if (playerCount < 9) return { valid: false, error: `Minimum 9 players required (currently ${playerCount})` };
        if (playerCount > 11) return { valid: false, error: `Maximum 11 players allowed (currently ${playerCount})` };

        return { valid: true };
    };

    const generateFormation = (): string => {
        const defenders = ['CDL', 'CD', 'CDR', 'LB', 'RB', 'WBL', 'WBR'].filter(pos => lineup[pos]).length;
        const midfielders = ['DML', 'DM', 'DMR', 'CML', 'CM', 'CMR', 'LM', 'RM'].filter(pos => lineup[pos]).length;
        const attackers = ['AML', 'AM', 'AMR', 'LW', 'RW', 'CFL', 'CF', 'CFR'].filter(pos => lineup[pos]).length;
        return `${defenders}-${midfielders}-${attackers}`;
    };

    const handleSubmit = async () => {
        if (isTacticsLocked) return;

        const validation = validateLineup();
        if (!validation.valid) {
            showNotification({ type: 'warning', title: 'Invalid Lineup', message: validation.error! });
            return;
        }

        // Validate complete events
        const invalidEvents = tacticalEvents.findIndex(e => !e.playerA || !e.playerB);
        if (invalidEvents !== -1) {
            showNotification({ type: 'warning', title: 'Incomplete Changes', message: `Please complete all fields for the tactical change at minute ${tacticalEvents[invalidEvents].minute}.` });
            return;
        }

        setIsSubmitting(true);

        const backendLineup: Record<string, string> = {};
        Object.entries(lineup).forEach(([slot, playerId]) => {
            if (playerId && SLOT_MAPPING[slot]) {
                backendLineup[SLOT_MAPPING[slot]] = playerId;
            }
        });

        try {
            const formationStr = generateFormation();

            const substitutions = tacticalEvents
                .filter(e => e.type === 'sub')
                .map(e => ({ minute: e.minute, out: e.playerA, in: e.playerB }));

            const moves = tacticalEvents
                .filter(e => e.type === 'move')
                .map(e => ({
                    minute: e.minute,
                    player: e.playerA,
                    position: SLOT_MAPPING[e.playerB] || e.playerB
                }));

            const instructions = { moves };

            await api.submitTactics(matchId, teamId, backendLineup, formationStr, substitutions, instructions);
            showNotification({
                type: 'success',
                title: 'Tactics Saved',
                message: `Your ${formationStr} formation and ${tacticalEvents.length} tactical changes have been submitted.`,
            });
        } catch (err) {
            showNotification({
                type: 'error',
                title: 'Save Failed',
                message: err instanceof Error ? err.message : 'Failed to submit tactics',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatCountdown = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
        else if (minutes > 0) return `${minutes}m ${secs}s`;
        else return `${secs}s`;
    };

    const validation = validateLineup();
    const formation = generateFormation();
    const assignedPlayerIds = new Set(Object.values(lineup).filter((id): id is string => id !== null));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-6">
            <div>
                <PitchLayout
                    lineup={lineup}
                    players={players}
                    onDrop={handleDrop}
                    onRemove={handleRemovePlayer}
                    onDragStart={(playerId, position) => handleDragStart(playerId, position)}
                    onDragEnd={handleDragEnd}
                    isDragging={draggedPlayer !== null}
                />
            </div>

            <div className="space-y-4">
                {isTacticsLocked && (
                    <div className="p-4 rounded-xl border-2 bg-red-50 border-red-500/40 dark:bg-red-950/20 dark:border-red-500/30">
                        <div className="flex items-center gap-3">
                            <Lock className="h-5 w-5 text-red-600 dark:text-red-400" />
                            <div className="flex-1">
                                <div className="text-sm font-bold text-red-900 dark:text-red-300">Tactics Locked</div>
                                <div className="text-xs text-red-700 dark:text-red-400">
                                    {matchStatus === 'scheduled' && countdown !== null && countdown > 0 && <>Match starts in {formatCountdown(countdown)}</>}
                                    {matchStatus === 'tactics_locked' && 'Match starting soon...'}
                                    {matchStatus === 'in_progress' && 'Match in progress'}
                                    {matchStatus === 'completed' && 'Match completed'}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {!isTacticsLocked && countdown !== null && countdown < 300 && (
                    <div className="p-4 rounded-xl border-2 bg-amber-50 border-amber-500/40 dark:bg-amber-950/20 dark:border-amber-500/30">
                        <div className="flex items-center gap-3">
                            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-pulse" />
                            <div>
                                <div className="text-sm font-bold text-amber-900 dark:text-amber-300">Time Running Out!</div>
                                <div className="text-xs text-amber-700 dark:text-amber-400">Tactics lock in {formatCountdown(countdown)}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="p-4 rounded-xl border-2 bg-white border-emerald-500/40 dark:bg-emerald-950/20 dark:border-emerald-500/30">
                    <div className="space-y-3">
                        <div>
                            <div className="text-xs text-slate-500 dark:text-emerald-600 uppercase tracking-wider mb-1">Formation</div>
                            <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-400">{formation}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 dark:text-emerald-600 uppercase tracking-wider mb-1">Players</div>
                            <div className={`text-lg font-bold ${validation.valid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {Object.values(lineup).filter(Boolean).length} / 11
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-5 rounded-2xl border-2 bg-gradient-to-br from-white to-slate-50 border-blue-500/40 dark:from-blue-950/20 dark:to-black/40 dark:border-blue-500/30 shadow-sm relative overflow-hidden group/subs transition-all hover:border-blue-500/60">
                    <div className="absolute -right-8 -top-8 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover/subs:bg-blue-500/10 transition-colors" />

                    <div className="relative">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                    <Move size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-[0.1em] text-blue-900 dark:text-blue-300">Tactical Changes</h3>
                                    <p className="text-[10px] text-slate-500 dark:text-blue-500/70 font-bold uppercase tracking-tighter">Schedule subs &amp; moves</p>
                                </div>
                            </div>
                            <button
                                onClick={handleAddEvent}
                                disabled={isTacticsLocked}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                            >
                                <Plus size={14} strokeWidth={3} /> Add
                            </button>
                        </div>

                        <div className="space-y-3">
                            {tacticalEvents.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-blue-500/20 rounded-2xl bg-blue-500/[0.02]">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/5 flex items-center justify-center mb-3">
                                        <ArrowRightLeft className="text-blue-500/30" size={20} />
                                    </div>
                                    <p className="text-xs font-bold text-slate-400 dark:text-blue-400/40 uppercase tracking-widest px-4">No changes planned</p>
                                </div>
                            ) : (
                                <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-blue-500/20">
                                    {tacticalEvents.map((event, idx) => {
                                        const assigned = new Set(Object.values(lineup).filter((id): id is string => id !== null));

                                        const starters = players.filter(p => assigned.has(p.id));
                                        const bench = players.filter(p => !assigned.has(p.id));

                                        const playerAOptions = starters;

                                        const playerBOptions = event.type === 'sub'
                                            ? bench
                                            : []; // Unused for Move

                                        // Show all positions as requested, do not filter occupied ones
                                        const availablePositions = POSITIONS;

                                        return (
                                            <div key={idx} className="group/item relative bg-white dark:bg-black/60 p-4 rounded-xl border border-slate-200 dark:border-blue-500/20 hover:border-blue-500/50 transition-all duration-300 shadow-sm hover:shadow-md animate-in slide-in-from-left-2 fade-in">
                                                <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded">
                                                            <Clock size={12} className="text-blue-500" />
                                                            <input
                                                                type="number"
                                                                min="1" max="90"
                                                                value={event.minute}
                                                                onChange={(e) => handleUpdateEvent(idx, { minute: parseInt(e.target.value) })}
                                                                className="w-8 bg-transparent text-xs font-bold text-center focus:outline-none"
                                                            />
                                                            <span className="text-[10px] font-bold text-slate-400">'</span>
                                                        </div>

                                                        <div className="flex rounded-lg bg-slate-100 dark:bg-slate-900 p-0.5">
                                                            <button
                                                                onClick={() => handleUpdateEvent(idx, { type: 'sub' })}
                                                                className={`p-1 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-1 ${event.type === 'sub'
                                                                    ? 'bg-blue-500 text-white shadow-sm'
                                                                    : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                                    }`}
                                                            >
                                                                <ArrowRightLeft size={12} /> Sub
                                                            </button>
                                                            <button
                                                                onClick={() => handleUpdateEvent(idx, { type: 'move' })}
                                                                className={`p-1 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-1 ${event.type === 'move'
                                                                    ? 'bg-amber-500 text-white shadow-sm'
                                                                    : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                                    }`}
                                                            >
                                                                <Move size={12} /> Move
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => handleRemoveEvent(idx)}
                                                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all opacity-0 group-hover/item:opacity-100"
                                                        title="Remove event"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                                                    {/* Player A (Always a starter) */}
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1.5 px-0.5">
                                                            {event.type === 'sub' ? <UserMinus size={10} className="text-red-400" /> : <Move size={10} className="text-amber-400" />}
                                                            <span className={`text-[9px] font-black uppercase tracking-tight ${event.type === 'sub' ? 'text-red-400/80' : 'text-amber-400/80'}`}>
                                                                Player
                                                            </span>
                                                        </div>
                                                        <PlayerSelect
                                                            value={event.playerA}
                                                            onChange={(id) => handleUpdateEvent(idx, { playerA: id })}
                                                            players={playerAOptions}
                                                            placeholder="Select Player"
                                                            disabled={isTacticsLocked}
                                                        />
                                                    </div>

                                                    <div className="pt-4 text-slate-300 dark:text-slate-600 flex justify-center">
                                                        {event.type === 'sub'
                                                            ? <ArrowRightLeft size={16} />
                                                            : <Move size={16} />
                                                        }
                                                    </div>

                                                    {/* Player B (Sub) OR Target Position (Move) */}
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-end gap-1.5 px-0.5">
                                                            <span className={`text-[9px] font-black uppercase tracking-tight ${event.type === 'sub' ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
                                                                {event.type === 'sub' ? 'In' : 'New Position'}
                                                            </span>
                                                            {event.type === 'sub' ? <UserPlus size={10} className="text-emerald-400" /> : <Move size={10} className="text-amber-400" />}
                                                        </div>

                                                        {event.type === 'sub' ? (
                                                            <PlayerSelect
                                                                value={event.playerB}
                                                                onChange={(id) => handleUpdateEvent(idx, { playerB: id })}
                                                                players={playerBOptions}
                                                                placeholder="Select Player"
                                                                align="right"
                                                                disabled={isTacticsLocked}
                                                            />
                                                        ) : (
                                                            <PositionSelect
                                                                value={event.playerB}
                                                                onChange={(pos) => handleUpdateEvent(idx, { playerB: pos })}
                                                                options={availablePositions}
                                                                placeholder="Select Position"
                                                                align="right"
                                                                disabled={isTacticsLocked}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!validation.valid || isSubmitting || isTacticsLocked}
                    className={`w-full px-6 py-4 rounded-xl border-2 font-bold uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isTacticsLocked
                        ? 'bg-gray-400 text-white border-gray-400 dark:bg-gray-600 dark:border-gray-600'
                        : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500 shadow-lg dark:bg-emerald-500 dark:border-emerald-500 dark:hover:bg-emerald-400'
                        }`}
                >
                    <div className="flex items-center justify-center gap-2">
                        {isTacticsLocked ? (
                            <>
                                <Lock size={20} /> Tactics Locked
                            </>
                        ) : (
                            <>
                                <Save size={20} /> {isSubmitting ? 'Saving...' : 'Save Tactics'}
                            </>
                        )}
                    </div>
                </button>

                {!validation.valid && validation.error && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400 font-bold uppercase tracking-tight">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            {validation.error}
                        </div>
                    </div>
                )}

                <PlayerRoster
                    players={players}
                    assignedPlayerIds={assignedPlayerIds}
                    onDragStart={(id) => handleDragStart(id, null)}
                    onDragEnd={handleDragEnd}
                />
            </div>
        </div>
    );
}

'use client';

import React from 'react';
import { Player, api, Auction } from '@/lib/api';
import { clsx } from 'clsx';
import Link from 'next/link';
import { MiniPlayer } from '@/components/MiniPlayer';
import { AbilityStars } from '@/components/ui/AbilityStars';
import { ListPlayerDialog } from '@/components/transfer/ListPlayerDialog';
import { useAuth } from '@/components/auth/AuthContext';
import { useState, useEffect } from 'react';
import { PlayerAppearance, Position } from '@/types/player';
import { convertAppearance, generateAppearance } from '@/utils/playerUtils';

interface RosterTableProps {
    players: Player[];
}

export function RosterTable({ players }: RosterTableProps) {
    const { user } = useAuth();
    const [listingPlayerId, setListingPlayerId] = useState<string | null>(null);
    const [activeAuctions, setActiveAuctions] = useState<Auction[]>([]);
    const [loadingAuctions, setLoadingAuctions] = useState(true);

    // Check if these are the user's players
    const isOwnSquad = players.length > 0 && players[0].teamId === user?.teamId;

    // Fetch active auctions to check if players are listed
    useEffect(() => {
        const fetchAuctions = async () => {
            if (!isOwnSquad) {
                setLoadingAuctions(false);
                return;
            }
            try {
                const auctions = await api.getAuctions();
                setActiveAuctions(auctions.filter(a => a.status === 'ACTIVE'));
            } catch (error) {
                console.error('Failed to fetch auctions:', error);
            } finally {
                setLoadingAuctions(false);
            }
        };
        fetchAuctions();
    }, [isOwnSquad]);

    // Check if player is in active auction
    const isPlayerInAuction = (playerId: string): boolean => {
        return activeAuctions.some(auction => auction.player.id === playerId);
    };

    // Sort: Goalkeepers first, then by name
    const sortedPlayers = [...players].sort((a, b) => {
        if (a.isGoalkeeper && !b.isGoalkeeper) return -1;
        if (!a.isGoalkeeper && b.isGoalkeeper) return 1;
        return a.name.localeCompare(b.name);
    });

    const getSkillColor = (val: number) => {
        if (val >= 16) return 'text-emerald-600 dark:text-emerald-400 font-bold';
        if (val >= 12) return 'text-emerald-500 dark:text-emerald-300';
        if (val >= 8) return 'text-amber-500 dark:text-yellow-400';
        return 'text-slate-500 dark:text-slate-400';
    };

    const getSkillBarColor = (val: number) => {
        if (val >= 16) return 'from-emerald-500 to-green-500';
        if (val >= 12) return 'from-emerald-600 to-green-600';
        if (val >= 8) return 'from-yellow-500 to-orange-500';
        return 'from-slate-600 to-slate-700';
    };

    const renderPlayerSkills = (player: Player) => {
        const skills = player.currentSkills;
        if (!skills) return null;

        const categories = [
            {
                key: 'physical',
                label: 'Physical',
                icon: '⚡',
                color: 'emerald',
                bgColor: 'bg-white/60 dark:bg-emerald-950/30',
                borderColor: 'border-slate-200 dark:border-emerald-500/20'
            },
            {
                key: 'technical',
                label: 'Technical',
                icon: '⚽',
                color: 'blue',
                bgColor: 'bg-white/60 dark:bg-blue-950/30',
                borderColor: 'border-slate-200 dark:border-blue-500/20'
            },
            {
                key: 'mental',
                label: 'Mental',
                icon: '🧠',
                color: 'purple',
                bgColor: 'bg-white/60 dark:bg-purple-950/30',
                borderColor: 'border-slate-200 dark:border-purple-500/20'
            }
        ];

        return (
            <div className="space-y-3">
                {categories.map(cat => {
                    const group = skills[cat.key] || {};
                    const textColor = cat.color === 'emerald' ? 'text-emerald-500' :
                        cat.color === 'blue' ? 'text-blue-500' : 'text-purple-400';

                    return (
                        <div key={cat.key} className={`rounded-lg ${cat.bgColor} border ${cat.borderColor} p-3`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">{cat.icon}</span>
                                <h4 className={`text-xs font-black italic uppercase ${textColor} tracking-wider`}>
                                    {cat.label}
                                </h4>
                            </div>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                                {Object.entries(group).map(([key, value]) => (
                                    <div key={key} className="flex items-center gap-3">
                                        <span className={`text-xs ${textColor} font-bold uppercase w-16 shrink-0`}>
                                            {key}
                                        </span>
                                        <span className={`font-mono text-sm ${getSkillColor(value as number)} font-bold w-6 text-center shrink-0`}>
                                            {String(value)}
                                        </span>
                                        <div className="flex-1 relative h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                            {/* Potential bar (background) */}
                                            {player.potentialSkills?.[cat.key]?.[key] && (
                                                <div
                                                    className="absolute inset-y-0 left-0 h-full rounded-full bg-slate-300 dark:bg-slate-600 opacity-60"
                                                    style={{ width: `${((player.potentialSkills[cat.key][key] as number) / 20) * 100}%` }}
                                                />
                                            )}
                                            {/* Current skill bar (foreground) */}
                                            <div
                                                className={`absolute inset-y-0 left-0 h-full rounded-full transition-all duration-300 ${
                                                    (value as number) >= (player.potentialSkills?.[cat.key]?.[key] || 0)
                                                        ? 'bg-emerald-500'
                                                        : 'bg-amber-500'
                                                }`}
                                                style={{ width: `${((value as number) / 20) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // Get player appearance from data or generate fallback
    const getPlayerAppearance = (player: Player): PlayerAppearance => {
        return convertAppearance(player.appearance) || generateAppearance(player.id);
    };

    return (
        <div className="relative overflow-hidden rounded-xl border transition-all duration-300
            bg-white border-emerald-500/40 shadow-none
            dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:backdrop-blur-md">
            {/* Background effect */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>

            {/* Header */}
            <div className="relative z-10 p-6 border-b 
                bg-white border-emerald-500/40
                dark:bg-transparent dark:border-emerald-500/20">
                <h2 className="text-3xl font-black italic mb-0
                    text-emerald-900
                    dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-emerald-400 dark:to-green-400">
                    Squad Roster
                </h2>
                <p className="text-emerald-600 text-sm font-mono tracking-wider uppercase mt-2">
                    {players.length} Players Active
                </p>
            </div>

            {/* Player Cards Grid */}
            <div className="relative z-10 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {sortedPlayers.map((player, index) => (
                        <Link
                            key={player.id}
                            href={`/players/${player.id}`}
                            className="group relative overflow-hidden rounded-2xl border-2 transition-all duration-300 p-4 md:p-5 backdrop-blur-sm
                                bg-white border-emerald-500/40 shadow-none hover:border-emerald-500 hover:shadow-none hover:-translate-y-1
                                dark:bg-black/40 dark:border-emerald-500/20 dark:hover:bg-emerald-500/5 dark:hover:border-emerald-400/40"
                        >
                            {/* Scanline effect */}
                            <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.05)_50%)] bg-[size:100%_4px] pointer-events-none rounded-2xl"></div>

                            <div className="flex gap-4">
                                {/* Left: Avatar with Number Badge */}
                                <div className="relative shrink-0">
                                    <div className="relative">
                                        <MiniPlayer
                                            appearance={getPlayerAppearance(player)}
                                            size={80}
                                        />
                                        {/* Number Badge - 头像右下角 */}
                                        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm
                                            bg-emerald-500 text-white border-2 border-white dark:border-slate-900 shadow-sm">
                                            {index + 1}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Info Area */}
                                <div className="flex-1 min-w-0">
                                    {/* Top Row: Name + Age + List Button */}
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-black text-lg transition-colors truncate
                                                text-slate-900 group-hover:text-emerald-700
                                                dark:text-white dark:group-hover:text-emerald-300">
                                                {player.name}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-xs font-mono text-slate-400 dark:text-emerald-500">
                                                    {player.age} yrs
                                                </span>
                                                {isOwnSquad && (
                                                    <AbilityStars currentSkills={player.currentSkills} isGoalkeeper={player.isGoalkeeper} size="sm" />
                                                )}
                                            </div>
                                        </div>
                                        {/* List Button / Auction Status */}
                                        {isOwnSquad && !isPlayerInAuction(player.id) && !player.onTransfer && (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setListingPlayerId(player.id);
                                                }}
                                                disabled={loadingAuctions}
                                                className="shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg
                                                    bg-emerald-500 text-white hover:bg-emerald-600 transition-colors
                                                    disabled:opacity-50"
                                            >
                                                + List
                                            </button>
                                        )}
                                        {(isOwnSquad && (isPlayerInAuction(player.id) || player.onTransfer)) && (
                                            <span className="shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg
                                                bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                                                On Auction
                                            </span>
                                        )}
                                    </div>

                                    {/* Bottom Row: Quick Stats (Stamina, Form, Exp) */}
                                    <div className="flex gap-3">
                                        <div className="flex-1 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50">
                                            <div className="text-[9px] uppercase text-slate-400 dark:text-slate-500">STA</div>
                                            <div className="font-black text-emerald-600 dark:text-amber-500">{Math.floor(player.stamina)}</div>
                                        </div>
                                        <div className="flex-1 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50">
                                            <div className="text-[9px] uppercase text-slate-400 dark:text-slate-500">FRM</div>
                                            <div className="font-black text-emerald-600 dark:text-emerald-400">{Math.floor(player.form)}</div>
                                        </div>
                                        <div className="flex-1 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50">
                                            <div className="text-[9px] uppercase text-slate-400 dark:text-slate-500">EXP</div>
                                            <div className="font-black text-emerald-600 dark:text-blue-400">{player.experience || 0}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Skills - Only for own squad */}
                            {isOwnSquad && (
                                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                    {renderPlayerSkills(player)}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            </div>

            {/* List Player Dialog */}
            {listingPlayerId && (
                <ListPlayerDialog
                    playerId={listingPlayerId}
                    onClose={() => setListingPlayerId(null)}
                    onSuccess={async () => {
                        setListingPlayerId(null);
                        // Refresh auctions list to update player status
                        try {
                            const auctions = await api.getAuctions();
                            setActiveAuctions(auctions.filter(a => a.status === 'ACTIVE'));
                        } catch (error) {
                            console.error('Failed to refresh auctions:', error);
                        }
                        // Refresh page to update player.onTransfer status
                        window.location.reload();
                    }}
                />
            )}

            {/* Footer */}
            <div className="relative z-10 p-5 border-t 
                bg-emerald-50 border-emerald-500/40
                dark:border-emerald-500/20 dark:bg-black/20">
                <p className="text-sm font-mono text-center tracking-wider
                    text-emerald-800 dark:text-emerald-600">
                    [ TOTAL: {players.length} PLAYERS ]
                </p>
            </div>
        </div>
    );
}

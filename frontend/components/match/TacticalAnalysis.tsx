'use client';

import { TeamSnapshot } from '@/lib/api';
import { Shield, Swords, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { useState } from 'react';

interface TacticalAnalysisProps {
    homeSnapshot: TeamSnapshot | null;
    awaySnapshot: TeamSnapshot | null;
    homeTeamName: string;
    awayTeamName: string;
}

export function TacticalAnalysis({ homeSnapshot, awaySnapshot, homeTeamName, awayTeamName }: TacticalAnalysisProps) {
    const [selectedPhase, setSelectedPhase] = useState<'attack' | 'defense' | 'possession'>('attack');

    if (!homeSnapshot || !awaySnapshot) {
        return null;
    }

    const homeLanes = homeSnapshot.laneStrengths;
    const awayLanes = awaySnapshot.laneStrengths;

    // Calculate win percentages for each lane in selected phase
    const calculateWinPercentage = (homeValue: number, awayValue: number): { home: number; away: number } => {
        const total = homeValue + awayValue;
        if (total === 0) return { home: 50, away: 50 };
        
        const homePercent = (homeValue / total) * 100;
        const awayPercent = (awayValue / total) * 100;
        
        return {
            home: Math.round(homePercent),
            away: Math.round(awayPercent)
        };
    };

    const lanes: Array<{ name: string; key: 'left' | 'center' | 'right' }> = [
        { name: 'Left', key: 'left' },
        { name: 'Center', key: 'center' },
        { name: 'Right', key: 'right' },
    ];

    return (
        <div className="rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white dark:bg-emerald-950/20 shadow-lg overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white/80 dark:bg-emerald-950/40 backdrop-blur-sm">
                <h3 className="text-lg font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                    <Target size={20} />
                    Tactical Battle Analysis
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-1">Lane Strength Comparison</p>
            </div>

            {/* Phase Selection */}
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-500/20">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSelectedPhase('attack')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                            selectedPhase === 'attack'
                                ? 'bg-emerald-600 text-white shadow-lg'
                                : 'bg-white dark:bg-emerald-900/40 text-slate-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                        }`}
                    >
                        <Swords size={16} />
                        Attack
                    </button>
                    <button
                        onClick={() => setSelectedPhase('defense')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                            selectedPhase === 'defense'
                                ? 'bg-emerald-600 text-white shadow-lg'
                                : 'bg-white dark:bg-emerald-900/40 text-slate-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                        }`}
                    >
                        <Shield size={16} />
                        Defense
                    </button>
                    <button
                        onClick={() => setSelectedPhase('possession')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
                            selectedPhase === 'possession'
                                ? 'bg-emerald-600 text-white shadow-lg'
                                : 'bg-white dark:bg-emerald-900/40 text-slate-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                        }`}
                    >
                        <Target size={16} />
                        Possession
                    </button>
                </div>
            </div>

            {/* Lane Comparisons */}
            <div className="p-6 space-y-6">
                {lanes.map(({ name, key }) => {
                    const homeValue = homeLanes[key][selectedPhase];
                    const awayValue = awayLanes[key][selectedPhase];
                    const percentages = calculateWinPercentage(homeValue, awayValue);
                    const homeAdvantage = homeValue - awayValue;
                    const isDraw = Math.abs(homeAdvantage) < 5;

                    return (
                        <div key={key} className="space-y-2">
                            {/* Lane Name */}
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                    {name} Lane
                                </h4>
                                <div className="flex items-center gap-2 text-xs font-mono">
                                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                                        {homeValue.toFixed(1)}
                                    </span>
                                    <span className="text-slate-400">vs</span>
                                    <span className="text-red-600 dark:text-red-400 font-bold">
                                        {awayValue.toFixed(1)}
                                    </span>
                                </div>
                            </div>

                            {/* Win/Loss Bar */}
                            <div className="relative h-8 bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden">
                                {/* Home Team (Blue - Left Side) */}
                                <div
                                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 flex items-center justify-start pl-2 transition-all duration-500"
                                    style={{ width: `${percentages.home}%` }}
                                >
                                    {percentages.home >= 20 && (
                                        <span className="text-white text-xs font-bold">{percentages.home}%</span>
                                    )}
                                </div>

                                {/* Away Team (Red - Right Side) */}
                                <div
                                    className="absolute right-0 top-0 h-full bg-gradient-to-l from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 flex items-center justify-end pr-2 transition-all duration-500"
                                    style={{ width: `${percentages.away}%` }}
                                >
                                    {percentages.away >= 20 && (
                                        <span className="text-white text-xs font-bold">{percentages.away}%</span>
                                    )}
                                </div>

                                {/* Center Divider */}
                                <div className="absolute left-1/2 top-0 h-full w-0.5 bg-white/50 dark:bg-slate-900/50 -translate-x-1/2"></div>
                            </div>

                            {/* Advantage Indicator */}
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-blue-600 dark:text-blue-400">
                                    {homeTeamName}
                                </span>
                                <div className="flex items-center gap-1">
                                    {isDraw ? (
                                        <span className="text-slate-500 font-bold uppercase">Balanced</span>
                                    ) : homeAdvantage > 0 ? (
                                        <>
                                            <TrendingUp size={14} className="text-blue-600 dark:text-blue-400" />
                                            <span className="text-blue-600 dark:text-blue-400 font-bold">
                                                +{homeAdvantage.toFixed(1)}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <TrendingDown size={14} className="text-red-600 dark:text-red-400" />
                                            <span className="text-red-600 dark:text-red-400 font-bold">
                                                {homeAdvantage.toFixed(1)}
                                            </span>
                                        </>
                                    )}
                                </div>
                                <span className="font-bold text-red-600 dark:text-red-400">
                                    {awayTeamName}
                                </span>
                            </div>
                        </div>
                    );
                })}

                {/* Overall Summary */}
                <div className="pt-4 mt-4 border-t-2 border-emerald-500/20">
                    <div className="text-center">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            Overall {selectedPhase} Strength
                        </div>
                        <div className="flex items-center justify-center gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                                    {(homeLanes.left[selectedPhase] + homeLanes.center[selectedPhase] + homeLanes.right[selectedPhase]).toFixed(1)}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{homeTeamName}</div>
                            </div>
                            <div className="text-slate-400 text-xl">:</div>
                            <div className="text-center">
                                <div className="text-2xl font-black text-red-600 dark:text-red-400">
                                    {(awayLanes.left[selectedPhase] + awayLanes.center[selectedPhase] + awayLanes.right[selectedPhase]).toFixed(1)}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">{awayTeamName}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

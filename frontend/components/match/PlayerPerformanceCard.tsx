'use client';

import { PlayerState } from '@/lib/api';
import { PlayerStaminaBar } from './PlayerStaminaBar';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PlayerPerformanceCardProps {
    player: PlayerState;
    compact?: boolean;
}

export function PlayerPerformanceCard({ player, compact = false }: PlayerPerformanceCardProps) {
    const getPerformanceIcon = () => {
        const multiplier = player.conditionMultiplier;
        if (multiplier > 1.05) return <TrendingUp className="w-3 h-3 text-emerald-500" />;
        if (multiplier < 0.95) return <TrendingDown className="w-3 h-3 text-red-500" />;
        return <Minus className="w-3 h-3 text-gray-400" />;
    };

    const getPerformanceColor = () => {
        const multiplier = player.conditionMultiplier;
        if (multiplier > 1.05) return 'text-emerald-600 dark:text-emerald-400';
        if (multiplier < 0.95) return 'text-red-600 dark:text-red-400';
        return 'text-gray-600 dark:text-gray-400';
    };

    if (compact) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate text-gray-900 dark:text-white">
                            {player.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            {player.position}
                        </div>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-medium ${getPerformanceColor()}`}>
                        {getPerformanceIcon()}
                        {(player.conditionMultiplier * 100).toFixed(0)}%
                    </div>
                </div>
                <PlayerStaminaBar stamina={player.stamina} showLabel={false} />
                {player.entryMinute > 0 && (
                    <div className="mt-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                        SUB
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-md hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white">{player.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{player.position}</p>
                </div>
                {player.entryMinute > 0 && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        SUB
                    </span>
                )}
            </div>

            <div className="space-y-3">
                <PlayerStaminaBar stamina={player.stamina} />

                <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Performance</span>
                    <div className={`flex items-center gap-1 font-semibold ${getPerformanceColor()}`}>
                        {getPerformanceIcon()}
                        {(player.conditionMultiplier * 100).toFixed(0)}%
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                        <span className="text-gray-500 dark:text-gray-400">Form:</span>
                        <span className="ml-1 font-medium text-gray-900 dark:text-white">
                            {player.form.toFixed(1)}
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-500 dark:text-gray-400">Exp:</span>
                        <span className="ml-1 font-medium text-gray-900 dark:text-white">
                            {player.experience.toFixed(0)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

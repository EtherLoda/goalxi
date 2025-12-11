
import React from 'react';
import { MatchStatsRes } from '@/lib/api';
import { clsx } from 'clsx';

interface MatchStatsProps {
    stats: MatchStatsRes;
    homeTeamName: string;
    awayTeamName: string;
}

export function MatchStats({ stats, homeTeamName, awayTeamName }: MatchStatsProps) {
    const { home, away } = stats;

    const StatRow = ({ label, homeValue, awayValue, isPercentage = false }: { label: string, homeValue: number, awayValue: number, isPercentage?: boolean }) => {
        const total = homeValue + awayValue;
        const homeWidth = total === 0 ? 50 : (homeValue / total) * 100;
        const awayWidth = total === 0 ? 50 : (awayValue / total) * 100;

        return (
            <div className="mb-4">
                <div className="flex justify-between text-sm text-slate-400 mb-1">
                    <span className="font-bold text-white">{isPercentage ? `${homeValue}%` : homeValue}</span>
                    <span>{label}</span>
                    <span className="font-bold text-white">{isPercentage ? `${awayValue}%` : awayValue}</span>
                </div>
                <div className="flex h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${homeWidth}%` }} />
                    <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${awayWidth}%` }} />
                </div>
            </div>
        );
    };

    return (
        <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-6">
            <h2 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-2">Match Stats</h2>

            <StatRow label="Possession" homeValue={home.possession} awayValue={away.possession} isPercentage />
            <StatRow label="Shots" homeValue={home.shots} awayValue={away.shots} />
            <StatRow label="Shots on Target" homeValue={home.shotsOnTarget} awayValue={away.shotsOnTarget} />
            <StatRow label="Corners" homeValue={home.corners} awayValue={away.corners} />
            <StatRow label="Fouls" homeValue={home.fouls} awayValue={away.fouls} />
            <StatRow label="Yellow Cards" homeValue={home.yellowCards} awayValue={away.yellowCards} />
            <StatRow label="Red Cards" homeValue={home.redCards} awayValue={away.redCards} />
        </div>
    );
}


import React from 'react';
import { Player } from '@/lib/api';
import { clsx } from 'clsx';
import Link from 'next/link';

interface RosterTableProps {
    players: Player[];
}

export function RosterTable({ players }: RosterTableProps) {
    // Sort: Goalkeepers first, then by name
    const sortedPlayers = [...players].sort((a, b) => {
        if (a.isGoalkeeper && !b.isGoalkeeper) return -1;
        if (!a.isGoalkeeper && b.isGoalkeeper) return 1;
        return a.name.localeCompare(b.name);
    });

    const getConditionColor = (value: number) => {
        if (value >= 15) return 'bg-emerald-500';
        if (value >= 10) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700 bg-slate-900/50">
                <h2 className="text-xl font-bold text-white">Squad Roster</h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-300">
                    <thead className="text-xs uppercase bg-slate-900/50 text-slate-400">
                        <tr>
                            <th className="px-6 py-3">Name</th>
                            <th className="px-6 py-3">Position</th>
                            <th className="px-6 py-3 text-center">Age</th>
                            <th className="px-6 py-3 text-center">Stamina</th>
                            <th className="px-6 py-3 text-center">Form</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedPlayers.map((player) => (
                            <tr key={player.id} className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4 font-medium text-white">
                                    <Link href={`/players/${player.id}`} className="hover:text-amber-400 hover:underline">
                                        {player.name}
                                    </Link>
                                    {player.isYouth && <span className="ml-2 text-xs text-blue-400 border border-blue-400 px-1 rounded">YTH</span>}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={clsx(
                                        "px-2 py-1 rounded text-xs font-bold",
                                        player.isGoalkeeper ? "bg-yellow-500/20 text-yellow-400" : "bg-blue-500/20 text-blue-400"
                                    )}>
                                        {player.isGoalkeeper ? 'GK' : 'Outfield'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">{player.age}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center space-x-2">
                                        <div className="w-16 h-2 bg-slate-600 rounded-full overflow-hidden">
                                            <div
                                                className={clsx("h-full", getConditionColor(player.stamina))}
                                                style={{ width: `${(player.stamina / 20) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-xs w-4">{player.stamina}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center justify-center space-x-2">
                                        <div className="w-16 h-2 bg-slate-600 rounded-full overflow-hidden">
                                            <div
                                                className={clsx("h-full", getConditionColor(player.form))}
                                                style={{ width: `${(player.form / 20) * 100}%` }}
                                            />
                                        </div>
                                        <span className="text-xs w-4">{player.form}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

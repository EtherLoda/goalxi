import { LeagueStanding } from '@/lib/api';
import { clsx } from 'clsx';
import Link from 'next/link';

interface StandingsTableProps {
    standings: LeagueStanding[];
}

export default function StandingsTable({ standings }: StandingsTableProps) {
    return (
        <div className="rounded-2xl border border-emerald-900/50 bg-black/40 backdrop-blur-sm overflow-hidden shadow-[0_0_20px_rgba(2,44,34,0.3)]">
            <div className="bg-emerald-950/20 px-6 h-[72px] border-b border-emerald-900/50 flex items-center">
                <h3 className="text-lg font-bold text-white tracking-wider uppercase flex items-center gap-2">
                    <span className="text-emerald-500">📊</span> League Standings
                </h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-emerald-950/40 text-emerald-400 uppercase text-[10px] font-bold tracking-widest">
                        <tr>
                            <th className="px-6 py-4 w-16 text-center">Pos</th>
                            <th className="px-6 py-4">Team</th>
                            <th className="px-4 py-4 text-center">P</th>
                            <th className="px-4 py-4 text-center">W</th>
                            <th className="px-4 py-4 text-center">D</th>
                            <th className="px-4 py-4 text-center">L</th>
                            <th className="px-4 py-4 text-center hidden md:table-cell">GF</th>
                            <th className="px-4 py-4 text-center hidden md:table-cell">GA</th>
                            <th className="px-4 py-4 text-center hidden md:table-cell">GD</th>
                            <th className="px-6 py-4 text-center font-bold text-white">Pts</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-900/30">
                        {standings.map((team) => (
                            <tr key={team.teamId} className="hover:bg-emerald-900/20 transition-colors group">
                                <td className="px-6 py-4 text-center font-medium">
                                    <span className={clsx(
                                        "inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold",
                                        team.position <= 4 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                                            team.position >= 18 ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-emerald-600/70"
                                    )}>
                                        {team.position}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-bold text-lg text-white group-hover:text-emerald-300 transition-colors">
                                    <Link href={`/teams/${team.teamId}`} className="hover:underline decoration-emerald-500/50">
                                        {team.teamName}
                                    </Link>
                                </td>
                                <td className="px-4 py-4 text-center text-emerald-600">{team.played}</td>
                                <td className="px-4 py-4 text-center text-emerald-500/80">{team.won}</td>
                                <td className="px-4 py-4 text-center text-emerald-500/80">{team.drawn}</td>
                                <td className="px-4 py-4 text-center text-emerald-500/80">{team.lost}</td>
                                <td className="px-4 py-4 text-center text-emerald-600 hidden md:table-cell">{team.goalsFor}</td>
                                <td className="px-4 py-4 text-center text-emerald-600 hidden md:table-cell">{team.goalsAgainst}</td>
                                <td className="px-4 py-4 text-center text-emerald-400 font-bold hidden md:table-cell">
                                    {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                                </td>
                                <td className="px-6 py-4 text-center font-black text-white text-xl shadow-emerald-500/20">
                                    {team.points}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

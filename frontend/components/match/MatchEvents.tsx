
import React from 'react';
import { MatchEvent } from '@/lib/api';
import { clsx } from 'clsx';
import { Goal, Shield, Flag, AlertTriangle, ArrowRightLeft } from 'lucide-react';

interface MatchEventsProps {
    events: MatchEvent[];
    homeTeamId: string;
    awayTeamId: string;
}

export function MatchEvents({ events, homeTeamId, awayTeamId }: MatchEventsProps) {
    const sortedEvents = [...events].sort((a, b) => b.minute - a.minute);

    const getIcon = (type: string) => {
        switch (type) {
            case 'GOAL': return <Goal size={16} className="text-emerald-400" />;
            case 'SAVE': return <Shield size={16} className="text-blue-400" />;
            case 'SHOT_OFF_TARGET': return <Flag size={16} className="text-slate-400" />; // Or equivalent
            case 'INTERCEPTION': return <ArrowRightLeft size={16} className="text-yellow-400" />;
            default: return <div className="w-4 h-4 rounded-full bg-slate-600" />;
        }
    };

    return (
        <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
            <div className="p-4 border-b border-slate-700 bg-slate-900/50">
                <h2 className="text-xl font-bold text-white">Match Events</h2>
            </div>
            <div className="max-h-[500px] overflow-y-auto p-4 space-y-3">
                {sortedEvents.length === 0 ? (
                    <div className="text-center text-slate-500 py-4">No events yet...</div>
                ) : (
                    sortedEvents.map((event) => {
                        const isHome = event.teamId === homeTeamId;
                        return (
                            <div key={event.id} className={clsx(
                                "flex items-center",
                                isHome ? "flex-row" : "flex-row-reverse"
                            )}>
                                <div className={clsx(
                                    "flex items-center space-x-3 p-3 rounded-lg max-w-[80%]",
                                    isHome ? "bg-slate-700/50" : "bg-slate-700/50 flex-row-reverse space-x-reverse"
                                )}>
                                    <div className="text-mono font-bold text-slate-300 w-8 text-center">{event.minute}'</div>
                                    <div className="p-1 bg-slate-800 rounded-full border border-slate-600">
                                        {getIcon(event.type)}
                                    </div>
                                    <div className="text-sm text-slate-200">
                                        <span className="font-bold">{event.typeName}</span>
                                        {event.data?.description && <span className="text-slate-400"> - {event.data.description}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

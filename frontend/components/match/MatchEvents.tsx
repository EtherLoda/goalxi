
import React from 'react';
import { MatchEvent } from '@/lib/api';
import { clsx } from 'clsx';
import { 
    Goal, 
    Shield, 
    Flag, 
    AlertCircle,
    ArrowRightLeft, 
    Target,
    TrendingUp, 
    Users,
    Swords,
    Play,
    CheckCircle2,
    XCircle,
    Angry,
    Award,
    Activity
} from 'lucide-react';

interface MatchEventsProps {
    events: MatchEvent[];
    homeTeamId: string;
    awayTeamId: string;
}

export function MatchEvents({ events, homeTeamId, awayTeamId }: MatchEventsProps) {
    // Filter out SNAPSHOT events - user doesn't want to see them
    // Check both typeName and type fields, case-insensitive with type safety
    const displayEvents = events.filter(e => {
        const typeName = typeof e.typeName === 'string' ? e.typeName.toUpperCase() : '';
        const type = typeof e.type === 'string' ? e.type.toUpperCase() : '';
        return typeName !== 'SNAPSHOT' && type !== 'SNAPSHOT';
    });
    const sortedEvents = [...displayEvents].sort((a, b) => b.minute - a.minute);

    const getIcon = (type: string | number | undefined) => {
        // Defensive type checking: ensure type is a string before calling toUpperCase()
        const typeStr = typeof type === 'string' ? type.toUpperCase() : String(type || '').toUpperCase();
        
        switch (typeStr) {
            // Goal events
            case 'GOAL': 
            case 'PENALTY_GOAL':
                return <Goal size={16} className="text-current" />;
            
            // Save/Defense events
            case 'SAVE': 
                return <Shield size={16} className="text-current" />;
            
            // Miss/Block events
            case 'MISS':
            case 'SHOT_OFF_TARGET': 
            case 'SHOT_BLOCKED':
                return <XCircle size={16} className="text-current" />;
            
            // Shot events
            case 'SHOT_ON_TARGET':
            case 'SHOT':
                return <Target size={16} className="text-current" />;
            
            // Turnover/Interception
            case 'INTERCEPTION': 
            case 'TURNOVER':
                return <ArrowRightLeft size={16} className="text-current" />;
            
            // Attack/Counter
            case 'ATTACK':
            case 'COUNTER_ATTACK':
            case 'ATTACK_SEQUENCE':
                return <TrendingUp size={16} className="text-current" />;
            
            // Midfield/Tackle
            case 'MIDFIELD_BATTLE':
            case 'TACKLE':
                return <Swords size={16} className="text-current" />;
            
            // Cards
            case 'YELLOW_CARD':
                return <AlertCircle size={16} className="text-yellow-600 dark:text-yellow-500" />;
            case 'RED_CARD':
                return <Angry size={16} className="text-red-700 dark:text-red-600" />;
            
            // Match flow events
            case 'KICKOFF':
                return <Play size={16} className="text-current" />;
            case 'FULL_TIME':
            case 'HALF_TIME':
                return <CheckCircle2 size={16} className="text-current" />;
            
            // Fouls
            case 'FOUL':
                return <Flag size={16} className="text-current" />;

            // Set Pieces
            case 'CORNER':
                return <Target size={16} className="text-amber-600 dark:text-amber-500" />;
            case 'FREE_KICK':
                return <Flag size={16} className="text-amber-600 dark:text-amber-500" />;
            case 'PENALTY':
                return <Target size={16} className="text-amber-600 dark:text-amber-500" />;
            case 'PENALTY_MISS':
                return <XCircle size={16} className="text-red-600 dark:text-red-500" />;
            
            // Substitutions
            case 'SUBSTITUTION':
            case 'TACTICAL_CHANGE':
                return <Users size={16} className="text-current" />;
            
            // Injury
            case 'INJURY':
                return <AlertCircle size={16} className="text-orange-600 dark:text-orange-500" />;
            
            // Awards (player of the match, etc.)
            case 'AWARD':
            case 'MOTM':
                return <Award size={16} className="text-current" />;
            
            default: 
                return <Flag size={16} className="text-current" />;
        }
    };

    return (
        <div className="rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 bg-gradient-to-b from-emerald-50/30 to-white dark:from-emerald-950/20 dark:to-emerald-950/10 shadow-lg overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white/80 dark:bg-emerald-950/40 backdrop-blur-sm">
                <h2 className="text-xl font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                    Match Events
                </h2>
                <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-1">
                    {sortedEvents.length} events
                </p>
            </div>

            {/* Events List - Timeline Style */}
            <div className="max-h-[600px] overflow-y-auto p-6 space-y-3">
                {sortedEvents.length === 0 ? (
                    <div className="text-center py-12">
                        <Activity className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No events yet...</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Events will appear here during the match</p>
                    </div>
                ) : (
                    sortedEvents.map((event, index) => {
                        // Determine event team affiliation
                        const isHomeEvent = event.teamId === homeTeamId;
                        const isAwayEvent = event.teamId === awayTeamId;
                        const isNeutral = !isHomeEvent && !isAwayEvent;
                        
                        // Get time badge background color
                        const getTimeBadgeColor = () => {
                            if (isHomeEvent) return 'bg-blue-500 text-white dark:bg-blue-600';
                            if (isAwayEvent) return 'bg-red-500 text-white dark:bg-red-600';
                            return 'bg-slate-400 text-white dark:bg-slate-600';
                        };

                        return (
                            <div
                                key={event.id || index}
                                className="flex items-start gap-4 animate-in slide-in-from-top-2 fade-in-0"
                                style={{ animationDelay: `${index * 30}ms` }}
                            >
                                {/* Time Badge - Left Side with Circular Background */}
                                <div className="flex-shrink-0">
                                    <div className={clsx(
                                        "w-12 h-12 rounded-full flex items-center justify-center shadow-md",
                                        getTimeBadgeColor()
                                    )}>
                                        <span className="text-sm font-black tabular-nums">
                                            {event.minute}'
                                        </span>
                                    </div>
                                </div>

                                {/* Event Content - Right Side */}
                                <div className="flex-1 min-w-0">
                                    <div className="bg-white dark:bg-slate-800/60 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700/50 p-4">
                                        {/* Event Type with Icon */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={clsx(
                                                "flex-shrink-0",
                                                isHomeEvent && "text-blue-600 dark:text-blue-400",
                                                isAwayEvent && "text-red-600 dark:text-red-400",
                                                isNeutral && "text-slate-600 dark:text-slate-400"
                                            )}>
                                                {getIcon(event.typeName || event.type)}
                                            </div>
                                            <span className={clsx(
                                                "text-xs font-bold uppercase tracking-wider",
                                                isHomeEvent && "text-blue-700 dark:text-blue-300",
                                                isAwayEvent && "text-red-700 dark:text-red-300",
                                                isNeutral && "text-slate-700 dark:text-slate-300"
                                            )}>
                                                {event.typeName?.replace(/_/g, ' ') || (typeof event.type === 'string' ? event.type.replace(/_/g, ' ') : String(event.type))}
                                            </span>
                                        </div>

                                        {/* Description */}
                                        <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                                            {event.data?.description || event.description || 'No description'}
                                        </p>

                                        {/* Player Details (Shooter + Assist) */}
                                        {(event.data?.playerName || event.data?.assistName) && (
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                {event.data?.playerName && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                                        👤 {event.data.playerName}
                                                    </span>
                                                )}
                                                {event.data?.assistName && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                                        🅰️ {event.data.assistName}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Shot Type Badge (for attack_sequence events) */}
                                        {event.data?.sequence?.shot?.shotType && (
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                                                    🎯 {event.data.sequence.shot.shotType.replace(/_/g, ' ')}
                                                </span>
                                                {event.data.sequence.attackType && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                                        ⚔️ {event.data.sequence.attackType.replace(/_/g, ' ')}
                                                    </span>
                                                )}
                                            </div>
                                        )}
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

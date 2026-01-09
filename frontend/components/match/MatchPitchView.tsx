'use client';

import { PlayerState, MatchEvent } from '@/lib/api';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance } from '@/utils/playerUtils';
import { convertAppearance } from '@/utils/playerUtils';

interface MatchPitchViewProps {
    homeTeamName: string;
    awayTeamName: string;
    homePlayers: PlayerState[];
    awayPlayers: PlayerState[];
    initialStamina?: Map<string, number>; // Map of playerId -> initial stamina at minute 0
    events?: MatchEvent[]; // Optional: for timeline
    totalMinutes?: number; // Optional: for timeline
    currentMinute?: number; // Optional: for timeline
    onTimeSelect?: (minute: number) => void; // Optional: callback when user selects a time
}

interface PlayerCardProps {
    player: PlayerState;
    isHome: boolean;
    initialStamina?: number; // Player's starting stamina value
}

// Convert numbered positions to directional names for display
function formatPositionName(position: string): string {
    const positionMap: Record<string, string> = {
        // Center backs
        'CB1': 'CBL',
        'CB2': 'CB',
        'CB3': 'CBR',

        // Defensive midfielders
        'DMF1': 'DML',
        'DMF2': 'DM',
        'DMF3': 'DMR',
        'DMF': 'DM',
        'CDM': 'DM',

        // Central midfielders
        'CM1': 'CML',
        'CM2': 'CM',
        'CM3': 'CMR',

        // Attacking midfielders
        'CAM1': 'AML',
        'CAM2': 'AM',
        'CAM3': 'AMR',
        'CAM': 'AM',

        // Strikers
        'ST1': 'CF_L',
        'ST2': 'CF',
        'ST3': 'CF_R',
        'ST': 'CF',
    };

    return positionMap[position] || position;
}

// Position coordinates for horizontal pitch (home on left 0-50%, away on right 50-100%)
// Home team: 11 positions evenly spread in left half
// Away team: 11 positions mirrored in right half
// Total 22 positions across full pitch
// Y-axis spacing: Wide positions moved inward from 8%/92% to 12%/88% for better visibility
const POSITION_COORDS: Record<string, { x: number; y: number }> = {
    // ===== GOALKEEPER (x: 5%) =====
    GK: { x: 5, y: 50 },

    // ===== DEFENSE (x: 15%) =====
    LB: { x: 15, y: 12 },   // Left back (moved inward from 8%)
    CBL: { x: 15, y: 32 },  // Center back left (±18% from center)
    CB: { x: 15, y: 50 },   // Center back
    CBR: { x: 15, y: 68 },  // Center back right (±18% from center)
    RB: { x: 15, y: 88 },   // Right back (moved inward from 92%)

    // Backward compatibility aliases
    CB1: { x: 15, y: 32 },  // Alias for CBL
    CB2: { x: 15, y: 50 },  // Alias for CB
    CB3: { x: 15, y: 68 },  // Alias for CBR

    // ===== WINGBACKS (x: 20%) =====
    LWB: { x: 20, y: 12 },  // Left wingback (moved inward from 8%)
    WB: { x: 20, y: 50 },   // Center wingback
    WBR: { x: 20, y: 68 },  // Right wingback
    RWB: { x: 20, y: 88 },  // Right wingback (moved inward from 92%)

    // ===== DEFENSIVE MIDFIELD (x: 25%) =====
    DML: { x: 25, y: 32 },  // Defensive midfielder left
    DM: { x: 25, y: 50 },   // Defensive midfielder center
    DMR: { x: 25, y: 68 },  // Defensive midfielder right
    CDM: { x: 25, y: 50 },  // Alias for DM

    // Backward compatibility aliases
    DMF1: { x: 25, y: 32 }, // Alias for DML
    DMF2: { x: 25, y: 50 }, // Alias for DM
    DMF3: { x: 25, y: 68 }, // Alias for DMR

    // ===== CENTRAL MIDFIELD (x: 30%) =====
    LM: { x: 30, y: 12 },   // Left midfielder (moved inward from 8%)
    CML: { x: 30, y: 32 },  // Central midfielder left
    CM: { x: 30, y: 50 },   // Central midfielder center
    CMR: { x: 30, y: 68 },  // Central midfielder right
    RM: { x: 30, y: 88 },   // Right midfielder (moved inward from 92%)

    // Backward compatibility aliases
    CM1: { x: 30, y: 32 },  // Alias for CML
    CM2: { x: 30, y: 50 },  // Alias for CM
    CM3: { x: 30, y: 68 },  // Alias for CMR

    // ===== ATTACKING MIDFIELD (x: 37%) =====
    AML: { x: 37, y: 32 },  // Attacking midfielder left
    AM: { x: 37, y: 50 },   // Attacking midfielder center
    AMR: { x: 37, y: 68 },  // Attacking midfielder right
    CAM: { x: 37, y: 50 },  // Alias for AM

    // Backward compatibility aliases
    CAM1: { x: 37, y: 32 }, // Alias for AML
    CAM2: { x: 37, y: 50 }, // Alias for AM
    CAM3: { x: 37, y: 68 }, // Alias for AMR

    // ===== FORWARDS (x: 45%) =====
    LW: { x: 45, y: 12 },   // Left winger (moved inward from 8%)
    CFL: { x: 45, y: 32 }, // Center forward left
    CF: { x: 45, y: 50 },   // Center forward
    CFR: { x: 45, y: 68 }, // Center forward right
    ST: { x: 45, y: 50 },   // Alias for CF
    RW: { x: 45, y: 88 },   // Right winger (moved inward from 92%)
};

function PlayerCard({ player, isHome, initialStamina }: PlayerCardProps) {
    // Use appearance from player data if available, otherwise generate from ID
    const appearance = convertAppearance(player.appearance) || generateAppearance(player.playerId);

    // Stamina calculation
    const currentStamina = player.stamina;
    const playerInitialStamina = initialStamina || 6.0;
    const staminaRatio = currentStamina / playerInitialStamina;

    // Calculate display percentage with 25% buffer
    let staminaPercentage: number;
    const bufferThreshold = 0.75;

    if (staminaRatio >= bufferThreshold) {
        staminaPercentage = 100;
    } else {
        staminaPercentage = Math.round((staminaRatio / bufferThreshold) * 100);
    }

    // Determine stamina circle color
    const getStaminaColor = () => {
        if (staminaPercentage >= 80) return '#10b981'; // green-500
        if (staminaPercentage >= 60) return '#eab308'; // yellow-500
        return '#ef4444'; // red-500
    };

    // Performance = positionalContribution × conditionMultiplier
    const contribution = player.positionalContribution || 50;
    const conditionMult = player.conditionMultiplier || 1.0;
    const performance = Math.round(contribution * conditionMult);

    // SVG circle properties for stamina ring
    const circleRadius = 28; // radius of the circle
    const circleCircumference = 2 * Math.PI * circleRadius;
    const staminaStrokeDashoffset = circleCircumference * (1 - staminaPercentage / 100);

    return (
        <div className="relative flex flex-col items-center">
            {/* Substitute Badge */}
            {player.entryMinute > 0 && (
                <div className="absolute -top-1 -right-1 z-20 bg-orange-500 text-white text-[6px] font-bold px-1 py-0.5 rounded shadow-md">
                    SUB
                </div>
            )}

            {/* Avatar with Performance & Stamina Circle */}
            <div className="relative w-16 h-16">
                {/* Stamina Progress Ring (SVG) */}
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                    {/* Background circle */}
                    <circle
                        cx="32"
                        cy="32"
                        r={circleRadius}
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="4"
                        className="dark:stroke-slate-700"
                    />
                    {/* Stamina progress circle */}
                    <circle
                        cx="32"
                        cy="32"
                        r={circleRadius}
                        fill="none"
                        stroke={getStaminaColor()}
                        strokeWidth="4"
                        strokeDasharray={circleCircumference}
                        strokeDashoffset={staminaStrokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                    />
                </svg>

                {/* Avatar in center */}
                <div className="absolute inset-2 rounded-full overflow-hidden border-2 border-white dark:border-slate-800 shadow-lg">
                    {appearance && (
                        <MiniPlayer
                            appearance={appearance}
                            size={48}
                        />
                    )}
                </div>

                {/* Performance Badge (bottom right of circle) */}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 dark:from-emerald-600 dark:to-emerald-700 flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-900">
                    <span className="text-[10px] font-black text-white">
                        {performance}
                    </span>
                </div>
            </div>

            {/* Player Name */}
            <div className="mt-1 text-[8px] font-bold text-slate-900 dark:text-white text-center max-w-[70px] truncate">
                {player.name.split(' ').pop()}
            </div>
        </div>
    );
}

export function MatchPitchView({ homeTeamName, awayTeamName, homePlayers, awayPlayers, initialStamina }: MatchPitchViewProps) {
    const homeStarters = homePlayers.filter(p => !p.entryMinute);
    const homeSubs = homePlayers.filter(p => p.entryMinute > 0);
    const awayStarters = awayPlayers.filter(p => !p.entryMinute);
    const awaySubs = awayPlayers.filter(p => p.entryMinute > 0);

    // Create position map for home team (left side)
    const homePositionMap: Record<string, PlayerState> = {};
    homeStarters.forEach(player => {
        homePositionMap[player.position] = player;
    });

    // Create position map for away team (right side - mirrored)
    const awayPositionMap: Record<string, PlayerState> = {};
    awayStarters.forEach(player => {
        awayPositionMap[player.position] = player;
    });

    return (
        <div className="rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-emerald-900/10 shadow-lg overflow-hidden">
            {/* Header with both teams */}
            <div className="p-4 border-b-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white/80 dark:bg-emerald-950/40 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                    <div className="text-left">
                        <h3 className="text-lg font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                            {homeTeamName}
                        </h3>
                        <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">Home</p>
                    </div>
                    <div className="text-center">
                        <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Match Formation</div>
                    </div>
                    <div className="text-right">
                        <h3 className="text-lg font-bold uppercase tracking-wider text-red-900 dark:text-red-300">
                            {awayTeamName}
                        </h3>
                        <p className="text-xs text-red-700 dark:text-red-400 mt-1">Away</p>
                    </div>
                </div>
            </div>

            {/* Horizontal Pitch */}
            <div className="p-6">
                <div className="relative w-full aspect-[16/7] rounded-xl border-4 border-white/30 shadow-2xl bg-gradient-to-br from-[#2d5016] via-[#3a6b1f] to-[#2d5016] dark:from-[#1a3d0f] dark:via-[#2d5016] dark:to-[#1a3d0f] overflow-hidden">
                    {/* Grass Pattern - horizontal stripes */}
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_4%,rgba(0,0,0,0.03)_4%,rgba(0,0,0,0.03)_8%)] pointer-events-none" />

                    {/* Pitch Markings */}
                    <div className="absolute inset-0 opacity-50 pointer-events-none">
                        {/* Center circle */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-white" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white" />
                        {/* Center line */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white" />

                        {/* Left penalty area (home) */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[16%] h-[60%] border-2 border-white border-l-0" />
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[6%] h-[30%] border-2 border-white border-l-0" />
                        {/* Left goal line */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-[20%] bg-white" />

                        {/* Right penalty area (away) */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[16%] h-[60%] border-2 border-white border-r-0" />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[6%] h-[30%] border-2 border-white border-r-0" />
                        {/* Right goal line */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-[20%] bg-white" />
                    </div>

                    {/* Home Team Players (Left Side) */}
                    <div className="absolute inset-0">
                        {Object.entries(POSITION_COORDS).map(([position, coords]) => {
                            const player = homePositionMap[position];
                            if (!player) return null;

                            return (
                                <div
                                    key={`home-${position}`}
                                    className="absolute z-10"
                                    style={{
                                        left: `${coords.x}%`,
                                        top: `${coords.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                >
                                    <PlayerCard
                                        player={player}
                                        isHome={true}
                                        initialStamina={initialStamina?.get(player.playerId)}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Away Team Players (Right Side - Mirrored) */}
                    <div className="absolute inset-0">
                        {Object.entries(POSITION_COORDS).map(([position, coords]) => {
                            const player = awayPositionMap[position];
                            if (!player) return null;

                            // Mirror X coordinate for away team (100 - x)
                            const mirroredX = 100 - coords.x;

                            return (
                                <div
                                    key={`away-${position}`}
                                    className="absolute z-10"
                                    style={{
                                        left: `${mirroredX}%`,
                                        top: `${coords.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                >
                                    <PlayerCard
                                        player={player}
                                        isHome={false}
                                        initialStamina={initialStamina?.get(player.playerId)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Substitutes Section */}
                {(homeSubs.length > 0 || awaySubs.length > 0) && (
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Home Subs */}
                        {homeSubs.length > 0 && (
                            <div>
                                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-2 uppercase tracking-wide">
                                    {homeTeamName} - Substitutes
                                </h4>
                                <div className="flex flex-wrap gap-3">
                                    {homeSubs.map(player => (
                                        <div key={player.playerId} className="flex-shrink-0">
                                            <PlayerCard
                                                player={player}
                                                isHome={true}
                                                initialStamina={initialStamina?.get(player.playerId)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Away Subs */}
                        {awaySubs.length > 0 && (
                            <div>
                                <h4 className="text-sm font-bold text-red-900 dark:text-red-300 mb-2 uppercase tracking-wide">
                                    {awayTeamName} - Substitutes
                                </h4>
                                <div className="flex flex-wrap gap-3">
                                    {awaySubs.map(player => (
                                        <div key={player.playerId} className="flex-shrink-0">
                                            <PlayerCard
                                                player={player}
                                                isHome={false}
                                                initialStamina={initialStamina?.get(player.playerId)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

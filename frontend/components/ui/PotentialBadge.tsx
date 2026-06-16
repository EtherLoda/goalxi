import React from 'react';

/**
 * 10-tier system derived from potentialAbility (0-100)
 * Legend(93-100), WorldClass(85-92), Superstar(77-84), Star(69-76),
 * Regular(61-68), Rotation(53-60), Backup(45-52), Prospect(37-44), Fringe(29-36), Amateur(0-28)
 */
export type PlayerTier =
    | 'Amateur'
    | 'Fringe'
    | 'Prospect'
    | 'Backup'
    | 'Rotation'
    | 'Regular'
    | 'Star'
    | 'Superstar'
    | 'WorldClass'
    | 'Legend';

export function deriveTierFromPA(pa: number): PlayerTier {
    if (pa >= 93) return 'Legend';
    if (pa >= 85) return 'WorldClass';
    if (pa >= 77) return 'Superstar';
    if (pa >= 69) return 'Star';
    if (pa >= 61) return 'Regular';
    if (pa >= 53) return 'Rotation';
    if (pa >= 45) return 'Backup';
    if (pa >= 37) return 'Prospect';
    if (pa >= 29) return 'Fringe';
    return 'Amateur';
}

interface PotentialBadgeProps {
    tier: PlayerTier;
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
}

const POTENTIAL_CONFIG: Record<PlayerTier, {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    glowColor: string;
    stars: number;
}> = {
    Amateur: {
        label: 'Amateur',
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/10',
        borderColor: 'border-slate-500/30',
        glowColor: 'shadow-[0_0_10px_rgba(148,163,184,0.2)]',
        stars: 1,
    },
    Fringe: {
        label: 'Fringe',
        color: 'text-slate-500',
        bgColor: 'bg-slate-600/10',
        borderColor: 'border-slate-600/30',
        glowColor: 'shadow-[0_0_10px_rgba(148,163,184,0.25)]',
        stars: 1,
    },
    Prospect: {
        label: 'Prospect',
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        glowColor: 'shadow-[0_0_10px_rgba(74,222,128,0.3)]',
        stars: 2,
    },
    Backup: {
        label: 'Backup',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        glowColor: 'shadow-[0_0_10px_rgba(52,211,153,0.3)]',
        stars: 2,
    },
    Rotation: {
        label: 'Rotation',
        color: 'text-teal-400',
        bgColor: 'bg-teal-500/10',
        borderColor: 'border-teal-500/30',
        glowColor: 'shadow-[0_0_12px_rgba(45,212,191,0.3)]',
        stars: 3,
    },
    Regular: {
        label: 'Regular',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        glowColor: 'shadow-[0_0_10px_rgba(96,165,250,0.3)]',
        stars: 3,
    },
    Star: {
        label: 'Star',
        color: 'text-indigo-400',
        bgColor: 'bg-indigo-500/10',
        borderColor: 'border-indigo-500/30',
        glowColor: 'shadow-[0_0_15px_rgba(129,140,248,0.35)]',
        stars: 4,
    },
    Superstar: {
        label: 'Superstar',
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/30',
        glowColor: 'shadow-[0_0_15px_rgba(192,132,252,0.3)]',
        stars: 4,
    },
    WorldClass: {
        label: 'WorldClass',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        glowColor: 'shadow-[0_0_20px_rgba(251,191,36,0.4)]',
        stars: 5,
    },
    Legend: {
        label: 'Legend',
        color: 'text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/30',
        glowColor: 'shadow-[0_0_25px_rgba(52,211,153,0.5)]',
        stars: 5,
    },
};

export const PotentialBadge: React.FC<PotentialBadgeProps> = ({
    tier,
    size = 'md',
    showLabel = true
}) => {
    const config = POTENTIAL_CONFIG[tier];

    const sizeClasses = {
        sm: 'text-[9px] px-2 py-0.5',
        md: 'text-[10px] px-3 py-1',
        lg: 'text-xs px-4 py-1.5',
    };

    const starSize = {
        sm: 'text-[10px]',
        md: 'text-xs',
        lg: 'text-sm',
    };

    return (
        <div
            className={`
                inline-flex items-center gap-1.5 rounded-lg border-2 font-bold tracking-wider uppercase
                ${config.color} ${config.bgColor} ${config.borderColor} ${config.glowColor}
                ${sizeClasses[size]}
            `}
        >
            {showLabel && <span>{config.label}</span>}
            <div className={`flex gap-0.5 ${starSize[size]}`}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <span
                        key={i}
                        className={i < config.stars ? config.color : 'text-slate-700'}
                    >
                        ★
                    </span>
                ))}
            </div>
        </div>
    );
};

interface PotentialStarsProps {
    tier: PlayerTier;
    size?: 'sm' | 'md' | 'lg';
}

export const PotentialStars: React.FC<PotentialStarsProps> = ({ tier, size = 'md' }) => {
    const config = POTENTIAL_CONFIG[tier];

    const starSize = {
        sm: 'text-sm',
        md: 'text-lg',
        lg: 'text-2xl',
    };

    return (
        <div className={`flex gap-0.5 ${starSize[size]}`}>
            {Array.from({ length: 5 }).map((_, i) => (
                <span
                    key={i}
                    className={`${i < config.stars ? config.color : 'text-slate-800'} transition-all`}
                    style={{
                        filter: i < config.stars ? 'drop-shadow(0 0 3px currentColor)' : 'none'
                    }}
                >
                    ★
                </span>
            ))}
        </div>
    );
};

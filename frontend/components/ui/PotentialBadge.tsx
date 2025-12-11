import React from 'react';

export type PotentialTier = 'LOW' | 'REGULAR' | 'HIGH_PRO' | 'ELITE' | 'LEGEND';

interface PotentialBadgeProps {
    tier: PotentialTier;
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
}

const POTENTIAL_CONFIG = {
    LOW: {
        label: 'Low',
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/10',
        borderColor: 'border-slate-500/30',
        glowColor: 'shadow-[0_0_10px_rgba(148,163,184,0.2)]',
        stars: 1,
    },
    REGULAR: {
        label: 'Regular',
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        glowColor: 'shadow-[0_0_10px_rgba(96,165,250,0.3)]',
        stars: 2,
    },
    HIGH_PRO: {
        label: 'High Pro',
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderColor: 'border-purple-500/30',
        glowColor: 'shadow-[0_0_15px_rgba(192,132,252,0.3)]',
        stars: 3,
    },
    ELITE: {
        label: 'Elite',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        glowColor: 'shadow-[0_0_20px_rgba(251,191,36,0.4)]',
        stars: 4,
    },
    LEGEND: {
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
    tier: PotentialTier;
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

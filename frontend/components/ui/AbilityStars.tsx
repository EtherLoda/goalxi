import React from 'react';

interface AbilityStarsProps {
    currentSkills: any;
    isGoalkeeper?: boolean;
    size?: 'sm' | 'md' | 'lg';
}

// Calculate overall rating from skills (0-20 scale)
const calculateOverallRating = (skills: any, isGoalkeeper: boolean = false): number => {
    if (!skills) return 0;

    let total = 0;
    let count = 0;

    if (isGoalkeeper && skills.technical) {
        const gkSkills = ['handling', 'reflexes', 'positioning'];
        gkSkills.forEach(skill => {
            if (skills.technical[skill] !== undefined) {
                total += skills.technical[skill];
                count++;
            }
        });
    }

    Object.values(skills).forEach((category: any) => {
        if (typeof category === 'object') {
            Object.values(category).forEach((value: any) => {
                if (typeof value === 'number') {
                    total += value;
                    count++;
                }
            });
        }
    });

    return count > 0 ? total / count : 0;
};

const ratingToStars = (rating: number): number => {
    if (rating < 4) return 1;
    if (rating < 8) return 2;
    if (rating < 12) return 3;
    if (rating < 16) return 4;
    return 5;
};

export const AbilityStars: React.FC<AbilityStarsProps> = ({
    currentSkills,
    isGoalkeeper = false,
    size = 'md'
}) => {
    const rating = calculateOverallRating(currentSkills, isGoalkeeper);
    const stars = ratingToStars(rating);

    const getStarColor = (index: number) => {
        if (index < stars) {
            if (stars === 5) return 'text-amber-400';
            if (stars === 4) return 'text-purple-400';
            if (stars === 3) return 'text-emerald-400';
            if (stars === 2) return 'text-blue-400';
            return 'text-slate-400';
        }
        return 'text-slate-300 dark:text-slate-700';
    };

    const sizeClasses = {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base',
    };

    return (
        <div className={`flex items-center ${sizeClasses[size]}`}>
            {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={getStarColor(i)}>
                    ★
                </span>
            ))}
        </div>
    );
};

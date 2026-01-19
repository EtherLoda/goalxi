'use client';

import { Player } from '@/lib/api';
import { AlertCircle } from 'lucide-react';

interface InjuryBadgeProps {
    player: Player;
    showRecoveryDays?: boolean;
}

export function InjuryBadge({ player, showRecoveryDays = true }: InjuryBadgeProps) {
    // Check if player is injured (currentInjuryValue > 0)
    const isInjured = (player as any).currentInjuryValue > 0;

    if (!isInjured) {
        return null;
    }

    const injuryType = (player as any).injuryType || '';
    const injuredAt = (player as any).injuredAt;

    // Get injury type label
    const injuryTypeLabels: Record<string, string> = {
        muscle: '肌肉',
        ligament: '韧带',
        joint: '关节',
        head: '头部',
        other: '其他',
    };

    const injuryTypeLabel = injuryTypeLabels[injuryType] || injuryType || '伤病';

    return (
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/20 border border-red-500/50">
            <AlertCircle size={12} className="text-red-500" />
            <span className="text-xs font-medium text-red-500">
                🚑 {injuryTypeLabel}
            </span>
            {showRecoveryDays && (
                <span className="text-[10px] text-red-400">
                    (预估恢复)
                </span>
            )}
        </div>
    );
}

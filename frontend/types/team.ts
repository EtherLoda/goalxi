/**
 * Bench configuration for team substitutions
 * Each position group has substitute players mapped by player ID
 * FB = Fullback (covers both LB/RB), W = Winger (covers both LW/RW)
 */
export interface BenchConfig {
    goalkeeper: string | null;              // GK 替补
    centerBack: string | null;              // CD 替补
    fullback: string | null;                // FB 替补 (合并 LB/RB)
    winger: string | null;                  // W 替补 (合并 LW/RW)
    centralMidfield: string | null;         // AM/CM/DM 中场替补
    forward: string | null;                 // FWD/CF 前锋替补
}

/**
 * Position group labels for UI display
 */
export const BENCH_CONFIG_LABELS: Record<keyof BenchConfig, string> = {
    goalkeeper: 'GK',
    centerBack: 'CD',
    fullback: 'FB',
    winger: 'W',
    centralMidfield: 'CM',
    forward: 'FW'
};

/**
 * Position group descriptions for UI
 */
export const BENCH_CONFIG_DESCRIPTIONS: Record<keyof BenchConfig, string> = {
    goalkeeper: 'Goalkeeper',
    centerBack: 'Center Back',
    fullback: 'Fullback (LB/RB)',
    winger: 'Winger (LW/RW)',
    centralMidfield: 'Central Midfield (AM/CM/DM)',
    forward: 'Forward (CF/FWD)'
};

/**
 * Bench positions for drag and drop (6 slots below pitch)
 */
export const BENCH_SLOTS = ['BENCH_GK', 'BENCH_CB', 'BENCH_FB', 'BENCH_W', 'BENCH_CM', 'BENCH_FW'];

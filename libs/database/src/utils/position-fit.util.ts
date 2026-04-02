/**
 * Position Fit Rating System
 * 计算球员在特定位置的综合适配度评分 (0-100)
 *
 * 基于位置权重矩阵设计，每
 * 每个位置的权重总和为100（偏左/偏右位置如CBL/CBR除外）。
 * 可用权重单位: 2, 4, 6, 8, 12, 16
 */

import { SimulationPlayerAttributes } from '../types/simulation-player';

// ==========================================
// Type Definitions
// ==========================================

export interface LaneWeights {
    attack: Partial<SimulationPlayerAttributes>;
    possession: Partial<SimulationPlayerAttributes>;
    defense: Partial<SimulationPlayerAttributes>;
}

export interface PositionWeightMatrix {
    center: LaneWeights;
    left: LaneWeights;
    right: LaneWeights;
}

export interface GKWeightMatrix {
    saveRating: Partial<SimulationPlayerAttributes>;
}

export type PositionWeightsMap = {
    [key: string]: PositionWeightMatrix | GKWeightMatrix;
};

export interface PositionFitResult {
    position: string;
    fit: number; // 0-100
    label: string;
}

// ==========================================
// Position Labels
// ==========================================

export const POSITION_LABELS: Record<string, string> = {
    GK: 'Goalkeeper',
    CF: 'Center Forward',
    ST: 'Striker',
    CFL: 'Center Forward (Left)',
    CFR: 'Center Forward (Right)',
    LW: 'Left Wing',
    RW: 'Right Wing',
    AM: 'Attacking Midfielder',
    CAM: 'Central Attacking Mid',
    AML: 'Left Attacking Mid',
    AMR: 'Right Attacking Mid',
    LM: 'Left Midfielder',
    RM: 'Right Midfielder',
    CM: 'Central Midfielder',
    CML: 'Left Central Mid',
    CMR: 'Right Central Mid',
    DM: 'Defensive Midfielder',
    CDM: 'Defensive Midfielder',
    DML: 'Left Defensive Mid',
    DMR: 'Right Defensive Mid',
    LB: 'Left Back',
    RB: 'Right Back',
    WB: 'Wing Back',
    LWB: 'Left Wing Back',
    WBR: 'Right Wing Back',
    RWB: 'Right Wing Back',
    CD: 'Center Defender',
    CB: 'Center Back',
    CDL: 'Center Defender (Left)',
    CDR: 'Center Defender (Right)',
};

export const POSITION_KEYS = Object.keys(POSITION_LABELS);

// ==========================================
// Position Weight Matrices
// ==========================================
// 权重总和: 每位置 = 100 (偏左/偏右位置除外)
// 可用权重: 2, 4, 6, 8, 12, 16

// ==========================================
// FORWARDS
// ==========================================

/**
 * CF - Center Forward (中间中锋)
 * Center: 56 + Left: 24 + Right: 24 = 100
 */
const CF_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { finishing: 16, positioning: 6, strength: 6, composure: 4, pace: 4, dribbling: 4 },
        possession: { passing: 6, dribbling: 4, strength: 2 },
        defense: {}
    },
    left: {
        attack: { pace: 6, finishing: 6, dribbling: 4, passing: 2 },
        possession: { passing: 6 },
        defense: {}
    },
    right: {
        attack: { pace: 6, finishing: 6, dribbling: 4, passing: 2 },
        possession: { passing: 6 },
        defense: {}
    }
};

/**
 * CFL - Center Forward (Left) (左中锋)
 * Center: 56 + Left: 42 + Right: 6 = 104
 */
const CFL_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { finishing: 16, positioning: 6, strength: 6, composure: 4, pace: 4, dribbling: 4 },
        possession: { passing: 6, dribbling: 4, strength: 2 },
        defense: {}
    },
    left: {
        attack: { pace: 10, finishing: 10, dribbling: 6, passing: 4 },
        possession: { passing: 8, dribbling: 4 },
        defense: {}
    },
    right: {
        attack: { passing: 6 },
        possession: {},
        defense: {}
    }
};

/**
 * CFR - Center Forward (Right) (右中锋)
 * Center: 56 + Right: 42 + Left: 6 = 104
 */
const CFR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { finishing: 16, positioning: 6, strength: 6, composure: 4, pace: 4, dribbling: 4 },
        possession: { passing: 6, dribbling: 4, strength: 2 },
        defense: {}
    },
    right: {
        attack: { pace: 10, finishing: 10, dribbling: 6, passing: 4 },
        possession: { passing: 8, dribbling: 4 },
        defense: {}
    },
    left: {
        attack: { passing: 6 },
        possession: {},
        defense: {}
    }
};

// ==========================================
// WINGS
// ==========================================

/**
 * LW - Left Wing (左边锋)
 * Left: 64 + Center: 30 + Right: 6 = 100
 */
const LW_WEIGHTS: PositionWeightMatrix = {
    left: {
        attack: { pace: 16, dribbling: 12, passing: 4, finishing: 4, strength: 2 },
        possession: { dribbling: 8, pace: 4, passing: 6 },
        defense: { pace: 4, defending: 2 }
    },
    center: {
        attack: { finishing: 6, dribbling: 6, pace: 4, passing: 4 },
        possession: { dribbling: 4, passing: 4, pace: 2 },
        defense: {}
    },
    right: {
        attack: { passing: 6 },
        possession: {},
        defense: {}
    }
};

/**
 * RW - Right Wing (右边锋)
 * Right: 64 + Center: 30 + Left: 6 = 100
 */
const RW_WEIGHTS: PositionWeightMatrix = {
    right: {
        attack: { pace: 16, dribbling: 12, passing: 4, finishing: 4, strength: 2 },
        possession: { dribbling: 8, pace: 4, passing: 6 },
        defense: { pace: 4, defending: 2 }
    },
    center: {
        attack: { finishing: 6, dribbling: 6, pace: 4, passing: 4 },
        possession: { dribbling: 4, passing: 4, pace: 2 },
        defense: {}
    },
    left: {
        attack: { passing: 6 },
        possession: {},
        defense: {}
    }
};

// ==========================================
// ATTACKING MIDFIELDERS
// ==========================================

/**
 * AM - Attacking Midfielder (中间前腰)
 * Center: 56 + Left: 22 + Right: 22 = 100
 */
const AM_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 10, dribbling: 12, finishing: 6, pace: 4 },
        possession: { passing: 10, dribbling: 6, positioning: 2 },
        defense: { defending: 4, positioning: 2 }
    },
    left: {
        attack: { passing: 6, dribbling: 6, pace: 2 },
        possession: { passing: 4, dribbling: 2, positioning: 2 },
        defense: {}
    },
    right: {
        attack: { passing: 6, dribbling: 6, pace: 2 },
        possession: { passing: 4, dribbling: 2, positioning: 2 },
        defense: {}
    }
};

/**
 * AML - Attacking Midfielder (Left) (偏左前腰)
 * Center: 56 + Left: 40 + Right: 4 = 100
 */
const AML_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 10, dribbling: 12, finishing: 6, pace: 4 },
        possession: { passing: 10, dribbling: 6, positioning: 2 },
        defense: { defending: 4, positioning: 2 }
    },
    left: {
        attack: { passing: 12, dribbling: 10, pace: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 2 },
        defense: {}
    },
    right: {
        attack: { passing: 4 },
        possession: {},
        defense: {}
    }
};

/**
 * AMR - Attacking Midfielder (Right) (偏右前腰)
 * Center: 56 + Right: 40 + Left: 4 = 100
 */
const AMR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 10, dribbling: 12, finishing: 6, pace: 4 },
        possession: { passing: 10, dribbling: 6, positioning: 2 },
        defense: { defending: 4, positioning: 2 }
    },
    right: {
        attack: { passing: 12, dribbling: 10, pace: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 2 },
        defense: {}
    },
    left: {
        attack: { passing: 4 },
        possession: {},
        defense: {}
    }
};

// ==========================================
// CENTRAL MIDFIELDERS
// ==========================================

/**
 * CM - Central Midfielder (中间中场)
 * Center: 52 + Left: 24 + Right: 24 = 100
 */
const CM_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 8, dribbling: 4, finishing: 4 },
        possession: { passing: 12, dribbling: 6, positioning: 4, composure: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, composure: 2 }
    },
    left: {
        attack: { passing: 4, dribbling: 2 },
        possession: { passing: 6, dribbling: 4, positioning: 2 },
        defense: { defending: 4, positioning: 2 }
    },
    right: {
        attack: { passing: 4, dribbling: 2 },
        possession: { passing: 6, dribbling: 4, positioning: 2 },
        defense: { defending: 4, positioning: 2 }
    }
};

/**
 * CML - Central Midfielder (Left) (偏左中场)
 * Center: 52 + Left: 48 + Right: 0 = 100
 */
const CML_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 8, dribbling: 4, finishing: 4 },
        possession: { passing: 12, dribbling: 6, positioning: 4, composure: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, composure: 2 }
    },
    left: {
        attack: { passing: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 4 },
        defense: { defending: 12, positioning: 8, pace: 4, strength: 4 }
    },
    right: {
        attack: {},
        possession: {},
        defense: {}
    }
};

/**
 * CMR - Central Midfielder (Right) (偏右中场)
 * Center: 52 + Right: 48 + Left: 0 = 100
 */
const CMR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 8, dribbling: 4, finishing: 4 },
        possession: { passing: 12, dribbling: 6, positioning: 4, composure: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, composure: 2 }
    },
    right: {
        attack: { passing: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 4 },
        defense: { defending: 12, positioning: 8, pace: 4, strength: 4 }
    },
    left: {
        attack: {},
        possession: {},
        defense: {}
    }
};

// ==========================================
// DEFENSIVE MIDFIELDERS
// ==========================================

/**
 * DM - Defensive Midfielder (中间防守中场)
 * Center: 52 + Left: 24 + Right: 24 = 100
 */
const DM_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 4, pace: 2 },
        defense: { defending: 12, positioning: 8, strength: 4, composure: 4, pace: 2 }
    },
    left: {
        attack: { passing: 2 },
        possession: { passing: 4, dribbling: 2, positioning: 2 },
        defense: { defending: 6, positioning: 4, pace: 2, strength: 2 }
    },
    right: {
        attack: { passing: 2 },
        possession: { passing: 4, dribbling: 2, positioning: 2 },
        defense: { defending: 6, positioning: 4, pace: 2, strength: 2 }
    }
};

/**
 * DML - Defensive Midfielder (Left) (偏左防守中场)
 * Center: 52 + Left: 48 + Right: 0 = 100
 */
const DML_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 4, pace: 2 },
        defense: { defending: 12, positioning: 8, strength: 4, composure: 4, pace: 2 }
    },
    left: {
        attack: { passing: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 4 },
        defense: { defending: 12, positioning: 8, pace: 4, strength: 4 }
    },
    right: {
        attack: {},
        possession: {},
        defense: {}
    }
};

/**
 * DMR - Defensive Midfielder (Right) (偏右防守中场)
 * Center: 52 + Right: 48 + Left: 0 = 100
 */
const DMR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { passing: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 4, pace: 2 },
        defense: { defending: 12, positioning: 8, strength: 4, composure: 4, pace: 2 }
    },
    right: {
        attack: { passing: 4 },
        possession: { passing: 8, dribbling: 4, positioning: 4 },
        defense: { defending: 12, positioning: 8, pace: 4, strength: 4 }
    },
    left: {
        attack: {},
        possession: {},
        defense: {}
    }
};

// ==========================================
// WIDE MIDFIELDERS
// ==========================================

/**
 * WML - Wide Midfielder (Left) (左中场)
 * Left: 60 + Center: 34 + Right: 6 = 100
 */
const WML_WEIGHTS: PositionWeightMatrix = {
    left: {
        attack: { pace: 10, dribbling: 10, passing: 4, finishing: 2 },
        possession: { dribbling: 8, pace: 4, passing: 8, positioning: 4 },
        defense: { pace: 4, defending: 4, positioning: 2 }
    },
    center: {
        attack: { finishing: 4, dribbling: 6, pace: 4, passing: 4 },
        possession: { dribbling: 6, passing: 6, pace: 2, positioning: 2 },
        defense: {}
    },
    right: {
        attack: { passing: 6 },
        possession: {},
        defense: {}
    }
};

/**
 * WMR - Wide Midfielder (Right) (右中场)
 * Right: 60 + Center: 34 + Left: 6 = 100
 */
const WMR_WEIGHTS: PositionWeightMatrix = {
    right: {
        attack: { pace: 10, dribbling: 10, passing: 4, finishing: 2 },
        possession: { dribbling: 8, pace: 4, passing: 8, positioning: 4 },
        defense: { pace: 4, defending: 4, positioning: 2 }
    },
    center: {
        attack: { finishing: 4, dribbling: 6, pace: 4, passing: 4 },
        possession: { dribbling: 6, passing: 6, pace: 2, positioning: 2 },
        defense: {}
    },
    left: {
        attack: { passing: 6 },
        possession: {},
        defense: {}
    }
};

// ==========================================
// DEFENDERS
// ==========================================

/**
 * CB / CD - Center Back (中后卫)
 * Center: 56 + Left: 22 + Right: 22 = 100
 */
const CB_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { passing: 12, dribbling: 4 },
        defense: { defending: 16, positioning: 8, strength: 8, pace: 4, composure: 4 }
    },
    left: {
        attack: {},
        possession: { passing: 4, dribbling: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, strength: 2 }
    },
    right: {
        attack: {},
        possession: { passing: 4, dribbling: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, strength: 2 }
    }
};

/**
 * CBL - Center Back (Left) (左中后卫)
 * Center: 56 + Left: 44 + Right: 22 = 122
 */
const CBL_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { passing: 12, dribbling: 4 },
        defense: { defending: 16, positioning: 8, strength: 8, pace: 4, composure: 4 }
    },
    left: {
        attack: {},
        possession: { passing: 8, dribbling: 4 },
        defense: { defending: 16, positioning: 8, pace: 4, strength: 4 }
    },
    right: {
        attack: {},
        possession: { passing: 4, dribbling: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, strength: 2 }
    }
};

/**
 * CBR - Center Back (Right) (右中后卫)
 * Center: 56 + Right: 44 + Left: 22 = 122
 */
const CBR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { passing: 12, dribbling: 4 },
        defense: { defending: 16, positioning: 8, strength: 8, pace: 4, composure: 4 }
    },
    right: {
        attack: {},
        possession: { passing: 8, dribbling: 4 },
        defense: { defending: 16, positioning: 8, pace: 4, strength: 4 }
    },
    left: {
        attack: {},
        possession: { passing: 4, dribbling: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, strength: 2 }
    }
};

/**
 * LB - Left Back (左后卫)
 * Left: 70 + Center: 22 + Right: 8 = 100
 */
const LB_WEIGHTS: PositionWeightMatrix = {
    left: {
        attack: { passing: 8, dribbling: 8, pace: 6, finishing: 2 },
        possession: { passing: 8, dribbling: 4, pace: 2 },
        defense: { defending: 16, positioning: 8, pace: 4, strength: 2, composure: 2 }
    },
    center: {
        attack: {},
        possession: { passing: 4, dribbling: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, strength: 2 }
    },
    right: {
        attack: { passing: 8 },
        possession: {},
        defense: {}
    }
};

/**
 * RB - Right Back (右后卫)
 * Right: 70 + Center: 22 + Left: 8 = 100
 */
const RB_WEIGHTS: PositionWeightMatrix = {
    right: {
        attack: { passing: 8, dribbling: 8, pace: 6, finishing: 2 },
        possession: { passing: 8, dribbling: 4, pace: 2 },
        defense: { defending: 16, positioning: 8, pace: 4, strength: 2, composure: 2 }
    },
    center: {
        attack: {},
        possession: { passing: 4, dribbling: 2 },
        defense: { defending: 8, positioning: 4, pace: 2, strength: 2 }
    },
    left: {
        attack: { passing: 8 },
        possession: {},
        defense: {}
    }
};

/**
 * WBL - Wing Back (Left) (左翼卫)
 * Left: 74 + Center: 18 + Right: 8 = 100
 */
const WBL_WEIGHTS: PositionWeightMatrix = {
    left: {
        attack: { pace: 8, passing: 8, dribbling: 6, finishing: 4, strength: 2 },
        possession: { passing: 8, dribbling: 4, pace: 2 },
        defense: { defending: 12, positioning: 6, pace: 4, strength: 4 }
    },
    center: {
        attack: {},
        possession: { passing: 4, dribbling: 4 },
        defense: { defending: 4, positioning: 2, pace: 4, strength: 2 }
    },
    right: {
        attack: { passing: 8 },
        possession: {},
        defense: {}
    }
};

/**
 * WBR - Wing Back (Right) (右翼卫)
 * Right: 74 + Center: 18 + Left: 8 = 100
 */
const WBR_WEIGHTS: PositionWeightMatrix = {
    right: {
        attack: { pace: 8, passing: 8, dribbling: 6, finishing: 4, strength: 2 },
        possession: { passing: 8, dribbling: 4, pace: 2 },
        defense: { defending: 12, positioning: 6, pace: 4, strength: 4 }
    },
    center: {
        attack: {},
        possession: { passing: 4, dribbling: 4 },
        defense: { defending: 4, positioning: 2, pace: 4, strength: 2 }
    },
    left: {
        attack: { passing: 8 },
        possession: {},
        defense: {}
    }
};

// ==========================================
// GOALKEEPER
// ==========================================

/**
 * GK - Goalkeeper (守门员)
 * reflexes + handling + positioning + composure + pace + strength + passing + dribbling = 100
 */
const GK_WEIGHTS: GKWeightMatrix = {
    saveRating: {
        gk_reflexes: 40,
        gk_handling: 20,
        positioning: 16,
        composure: 12,
        pace: 4,
        strength: 8,
    }
};

// ==========================================
// Position Weights Export Map
// ==========================================

export const POSITION_WEIGHTS: PositionWeightsMap = {
    // Forwards
    'CF': CF_WEIGHTS,
    'ST': CF_WEIGHTS,
    'CFL': CFL_WEIGHTS,
    'CFR': CFR_WEIGHTS,
    'LW': LW_WEIGHTS,
    'RW': RW_WEIGHTS,

    // Attacking Midfielders
    'AM': AM_WEIGHTS,
    'CAM': AM_WEIGHTS,
    'AML': AML_WEIGHTS,
    'AMR': AMR_WEIGHTS,

    // Wide Midfielders
    'LM': WML_WEIGHTS,
    'RM': WMR_WEIGHTS,
    'WML': WML_WEIGHTS,
    'WMR': WMR_WEIGHTS,

    // Central Midfielders
    'CM': CM_WEIGHTS,
    'CML': CML_WEIGHTS,
    'CMR': CMR_WEIGHTS,

    // Defensive Midfielders
    'DM': DM_WEIGHTS,
    'CDM': DM_WEIGHTS,
    'DML': DML_WEIGHTS,
    'DMR': DMR_WEIGHTS,

    // Defenders
    'LB': LB_WEIGHTS,
    'RB': RB_WEIGHTS,
    'WB': WBL_WEIGHTS,
    'LWB': WBL_WEIGHTS,
    'WBR': WBR_WEIGHTS,
    'RWB': WBR_WEIGHTS,
    'CD': CB_WEIGHTS,
    'CB': CB_WEIGHTS,
    'CDL': CBL_WEIGHTS,
    'CDR': CBR_WEIGHTS,

    // Goalkeeper
    'GK': GK_WEIGHTS
};

// ==========================================
// Calculation Functions
// ==========================================

function getAttrValue(attrs: SimulationPlayerAttributes, attrName: string): number {
    const val = (attrs as any)[attrName];
    return typeof val === 'number' ? val : 0;
}

function computeWeightedSum(
    attrs: SimulationPlayerAttributes,
    weights: Partial<SimulationPlayerAttributes>
): number {
    let sum = 0;
    for (const [key, weight] of Object.entries(weights)) {
        if (typeof weight === 'number' && key !== 'abilities') {
            sum += getAttrValue(attrs, key) * weight;
        }
    }
    return sum;
}

/**
 * 计算某个 lane×phase 组合的权重总和
 */
function getPhaseWeightTotal(
    weights: Partial<SimulationPlayerAttributes>
): number {
    let total = 0;
    for (const [, weight] of Object.entries(weights)) {
        if (typeof weight === 'number') {
            total += weight;
        }
    }
    return total;
}

/**
 * 计算球员在特定位置的适配度评分 (0-100)
 *
 * 原理：
 * - 对每个 lane×phase 组合，计算 weightedSum = Σ(attrValue × weight)
 * - 所有组合的 weightedSum 相加得到 totalScore
 * - totalScore / (totalWeight × 20) × 100 = fit score
 * - 当所有属性=20时，fit score = 100
 */
export function calculatePositionFit(
    attrs: SimulationPlayerAttributes,
    positionKey: string
): number {
    const weights = POSITION_WEIGHTS[positionKey];
    if (!weights) return 0;

    if (positionKey === 'GK') {
        const gkWeights = weights as GKWeightMatrix;
        const totalWeight = getPhaseWeightTotal(gkWeights.saveRating);
        if (totalWeight === 0) return 0;
        const rawScore = computeWeightedSum(attrs, gkWeights.saveRating);
        // max rawScore = totalWeight × 20
        return Math.round((rawScore / (totalWeight * 20)) * 100);
    }

    const posWeights = weights as PositionWeightMatrix;
    let totalScore = 0;
    let totalWeight = 0;

    const lanes = ['center', 'left', 'right'] as const;
    const phases = ['attack', 'possession', 'defense'] as const;

    for (const lane of lanes) {
        const laneData = posWeights[lane];
        if (!laneData) continue;
        for (const phase of phases) {
            const phaseWeights = laneData[phase];
            if (!phaseWeights || Object.keys(phaseWeights).length === 0) continue;
            totalScore += computeWeightedSum(attrs, phaseWeights);
            totalWeight += getPhaseWeightTotal(phaseWeights);
        }
    }

    if (totalWeight === 0) return 0;
    // max rawScore = totalWeight × 20
    return Math.round((totalScore / (totalWeight * 20)) * 100);
}

/**
 * 获取球员在所有位置的适配度评分报告（按评分降序）
 */
export function getPositionFitReport(
    attrs: SimulationPlayerAttributes
): PositionFitResult[] {
    const results: PositionFitResult[] = [];

    for (const position of POSITION_KEYS) {
        const fit = calculatePositionFit(attrs, position);
        results.push({
            position,
            fit,
            label: POSITION_LABELS[position] || position,
        });
    }

    return results.sort((a, b) => b.fit - a.fit);
}

/**
 * 获取球员的最佳位置
 */
export function getBestPosition(
    attrs: SimulationPlayerAttributes
): PositionFitResult {
    return getPositionFitReport(attrs)[0];
}

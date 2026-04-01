/**
 * Position Fit Rating System
 * 计算球员在特定位置的综合适配度评分 (0-100)
 *
 * 基于比赛引擎的 position-weights.ts 权重矩阵，
 * 提供给经理参考球员最适合踢哪个位置。
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
    CAM1: 'Attacking Mid (Left)',
    CAM2: 'Attacking Mid (Center)',
    CAM3: 'Attacking Mid (Right)',
    AML: 'Left Attacking Mid',
    AMR: 'Right Attacking Mid',
    LM: 'Left Midfielder',
    RM: 'Right Midfielder',
    CM: 'Central Midfielder',
    CM1: 'Central Mid (Left)',
    CM2: 'Central Mid (Center)',
    CM3: 'Central Mid (Right)',
    CML: 'Left Central Mid',
    CMR: 'Right Central Mid',
    DM: 'Defensive Midfielder',
    CDM: 'Defensive Midfielder',
    DMF: 'Defensive Midfielder',
    DMF1: 'Defensive Mid (Left)',
    DMF2: 'Defensive Mid (Center)',
    DMF3: 'Defensive Mid (Right)',
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

// ==========================================
// FORWARDS
// ==========================================

const CF_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.55, strength: 0.65, finishing: 1.00, passing: 0.35, dribbling: 0.45, positioning: 0.90, composure: 0.60 },
        possession: { pace: 0.10, strength: 0.35, passing: 0.40, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.15, strength: 0.40, defending: 0.10, positioning: 0.10 }
    },
    left: {
        attack: { pace: 0.30, strength: 0.15, finishing: 0.35, passing: 0.25, dribbling: 0.20, positioning: 0.20 },
        possession: { strength: 0.15, passing: 0.08, positioning: 0.02 },
        defense: {}
    },
    right: {
        attack: { pace: 0.30, strength: 0.15, finishing: 0.35, passing: 0.25, dribbling: 0.20, positioning: 0.20 },
        possession: { strength: 0.15, passing: 0.08, positioning: 0.02 },
        defense: {}
    }
};

const CF_L_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.55, strength: 0.65, finishing: 1.00, passing: 0.35, dribbling: 0.45, positioning: 0.90, composure: 0.60 },
        possession: { pace: 0.10, strength: 0.35, passing: 0.40, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.15, strength: 0.40, defending: 0.10, positioning: 0.10 }
    },
    left: {
        attack: { pace: 0.50, strength: 0.25, finishing: 0.60, passing: 0.40, dribbling: 0.40, positioning: 0.35 },
        possession: { strength: 0.25, passing: 0.15, positioning: 0.05 },
        defense: {}
    },
    right: {
        attack: { pace: 0.15, strength: 0.10, finishing: 0.20, passing: 0.15, dribbling: 0.10, positioning: 0.10 },
        possession: { strength: 0.05, passing: 0.05 },
        defense: {}
    }
};

const CF_R_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.55, strength: 0.65, finishing: 1.00, passing: 0.35, dribbling: 0.45, positioning: 0.90, composure: 0.60 },
        possession: { pace: 0.10, strength: 0.35, passing: 0.40, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.15, strength: 0.40, defending: 0.10, positioning: 0.10 }
    },
    right: {
        attack: { pace: 0.50, strength: 0.25, finishing: 0.60, passing: 0.40, dribbling: 0.40, positioning: 0.35 },
        possession: { strength: 0.25, passing: 0.15, positioning: 0.05 },
        defense: {}
    },
    left: {
        attack: { pace: 0.15, strength: 0.10, finishing: 0.20, passing: 0.15, dribbling: 0.10, positioning: 0.10 },
        possession: { strength: 0.05, passing: 0.05 },
        defense: {}
    }
};

const LW_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.30, finishing: 0.40, passing: 0.20, dribbling: 0.30, positioning: 0.30 },
        possession: { pace: 0.10, passing: 0.30, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.15, defending: 0.10, positioning: 0.10 }
    },
    left: {
        attack: { pace: 1.00, strength: 0.20, finishing: 0.40, passing: 0.60, dribbling: 0.90, positioning: 0.40 },
        possession: { pace: 0.40, strength: 0.20, passing: 0.50, dribbling: 0.60, positioning: 0.30 },
        defense: { pace: 0.30, strength: 0.10, defending: 0.20, positioning: 0.20 }
    },
    right: {
        attack: { pace: 0.10, passing: 0.10, positioning: 0.10 },
        possession: { passing: 0.15, dribbling: 0.10 },
        defense: {}
    }
};

const RW_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.30, finishing: 0.40, passing: 0.20, dribbling: 0.30, positioning: 0.30 },
        possession: { pace: 0.10, passing: 0.30, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.15, defending: 0.10, positioning: 0.10 }
    },
    right: {
        attack: { pace: 1.00, strength: 0.20, finishing: 0.40, passing: 0.60, dribbling: 0.90, positioning: 0.40 },
        possession: { pace: 0.40, strength: 0.20, passing: 0.50, dribbling: 0.60, positioning: 0.30 },
        defense: { pace: 0.30, strength: 0.10, defending: 0.20, positioning: 0.20 }
    },
    left: {
        attack: { pace: 0.10, passing: 0.10, positioning: 0.10 },
        possession: { passing: 0.15, dribbling: 0.10 },
        defense: {}
    }
};

// ==========================================
// ATTACKING MIDFIELDERS
// ==========================================

const AM_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.25, strength: 0.10, finishing: 0.40, passing: 0.70, dribbling: 0.50, positioning: 0.20 },
        possession: { pace: 0.15, strength: 0.15, passing: 0.90, dribbling: 0.70, positioning: 0.25 },
        defense: { pace: 0.15, strength: 0.10, defending: 0.30, positioning: 0.20 }
    },
    left: {
        attack: { pace: 0.15, finishing: 0.15, passing: 0.40, dribbling: 0.20, positioning: 0.10 },
        possession: { pace: 0.10, passing: 0.50, dribbling: 0.30, positioning: 0.10 },
        defense: { pace: 0.10, defending: 0.20, positioning: 0.10 }
    },
    right: {
        attack: { pace: 0.15, finishing: 0.15, passing: 0.40, dribbling: 0.20, positioning: 0.10 },
        possession: { pace: 0.10, passing: 0.50, dribbling: 0.30, positioning: 0.10 },
        defense: { pace: 0.10, defending: 0.20, positioning: 0.10 }
    }
};

const AML_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.25, strength: 0.10, finishing: 0.40, passing: 0.70, dribbling: 0.50, positioning: 0.20 },
        possession: { pace: 0.15, strength: 0.15, passing: 0.90, dribbling: 0.70, positioning: 0.25 },
        defense: { pace: 0.15, strength: 0.10, defending: 0.30, positioning: 0.20 }
    },
    left: {
        attack: { pace: 0.25, finishing: 0.30, passing: 0.50, dribbling: 0.30, positioning: 0.15 },
        possession: { pace: 0.15, strength: 0.10, passing: 0.70, dribbling: 0.45, positioning: 0.10 },
        defense: { pace: 0.20, strength: 0.10, defending: 0.30, positioning: 0.15 }
    },
    right: {
        attack: { pace: 0.10, finishing: 0.10, passing: 0.20, dribbling: 0.10 },
        possession: { passing: 0.30, dribbling: 0.15 },
        defense: {}
    }
};

const AMR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.25, strength: 0.10, finishing: 0.40, passing: 0.70, dribbling: 0.50, positioning: 0.20 },
        possession: { pace: 0.15, strength: 0.15, passing: 0.90, dribbling: 0.70, positioning: 0.25 },
        defense: { pace: 0.15, strength: 0.10, defending: 0.30, positioning: 0.20 }
    },
    right: {
        attack: { pace: 0.25, finishing: 0.30, passing: 0.50, dribbling: 0.30, positioning: 0.15 },
        possession: { pace: 0.15, strength: 0.10, passing: 0.70, dribbling: 0.45, positioning: 0.10 },
        defense: { pace: 0.20, strength: 0.10, defending: 0.30, positioning: 0.15 }
    },
    left: {
        attack: { pace: 0.10, finishing: 0.10, passing: 0.20, dribbling: 0.10 },
        possession: { passing: 0.30, dribbling: 0.15 },
        defense: {}
    }
};

// ==========================================
// CENTRAL MIDFIELDERS
// ==========================================

const CM_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.15, strength: 0.10, finishing: 0.20, passing: 0.45, dribbling: 0.20, positioning: 0.10 },
        possession: { pace: 0.15, strength: 0.25, passing: 0.90, dribbling: 0.80, positioning: 0.40, composure: 0.10 },
        defense: { pace: 0.20, strength: 0.25, defending: 0.50, positioning: 0.25, composure: 0.10 }
    },
    left: {
        attack: { pace: 0.10, passing: 0.30, dribbling: 0.15 },
        possession: { pace: 0.10, strength: 0.15, passing: 0.60, dribbling: 0.30, positioning: 0.10 },
        defense: { pace: 0.10, strength: 0.10, defending: 0.25, positioning: 0.10 }
    },
    right: {
        attack: { pace: 0.10, passing: 0.30, dribbling: 0.15 },
        possession: { pace: 0.10, strength: 0.15, passing: 0.60, dribbling: 0.30, positioning: 0.10 },
        defense: { pace: 0.10, strength: 0.10, defending: 0.25, positioning: 0.10 }
    }
};

const CML_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.15, strength: 0.10, finishing: 0.20, passing: 0.45, dribbling: 0.20, positioning: 0.10 },
        possession: { pace: 0.15, strength: 0.25, passing: 0.90, dribbling: 0.80, positioning: 0.40, composure: 0.10 },
        defense: { pace: 0.20, strength: 0.25, defending: 0.40, positioning: 0.25, composure: 0.10 }
    },
    left: {
        attack: { pace: 0.20, strength: 0.10, finishing: 0.15, passing: 0.45, dribbling: 0.25 },
        possession: { pace: 0.15, strength: 0.20, passing: 0.85, dribbling: 0.50, positioning: 0.15 },
        defense: { pace: 0.20, strength: 0.20, defending: 0.50, positioning: 0.25 }
    },
    right: {
        attack: {},
        possession: { passing: 0.40, dribbling: 0.20 },
        defense: {}
    }
};

const CMR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.15, strength: 0.10, finishing: 0.20, passing: 0.45, dribbling: 0.20, positioning: 0.10 },
        possession: { pace: 0.15, strength: 0.25, passing: 0.90, dribbling: 0.80, positioning: 0.40, composure: 0.10 },
        defense: { pace: 0.20, strength: 0.25, defending: 0.40, positioning: 0.25, composure: 0.10 }
    },
    right: {
        attack: { pace: 0.20, strength: 0.10, finishing: 0.15, passing: 0.45, dribbling: 0.25 },
        possession: { pace: 0.15, strength: 0.20, passing: 0.85, dribbling: 0.50, positioning: 0.15 },
        defense: { pace: 0.20, strength: 0.20, defending: 0.50, positioning: 0.25 }
    },
    left: {
        attack: {},
        possession: { passing: 0.40, dribbling: 0.20 },
        defense: {}
    }
};

// ==========================================
// DEFENSIVE MIDFIELDERS
// ==========================================

const DM_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.10, strength: 0.10, finishing: 0.15, passing: 0.30, dribbling: 0.10 },
        possession: { pace: 0.15, strength: 0.30, passing: 0.90, dribbling: 0.80, positioning: 0.50, composure: 0.15 },
        defense: { pace: 0.25, strength: 0.30, defending: 0.70, positioning: 0.50, composure: 0.25 }
    },
    left: {
        attack: { passing: 0.25, dribbling: 0.10 },
        possession: { pace: 0.10, strength: 0.15, passing: 0.50, dribbling: 0.20 },
        defense: { pace: 0.15, strength: 0.15, defending: 0.30, positioning: 0.15 }
    },
    right: {
        attack: { passing: 0.25, dribbling: 0.10 },
        possession: { pace: 0.10, strength: 0.15, passing: 0.50, dribbling: 0.20 },
        defense: { pace: 0.15, strength: 0.15, defending: 0.30, positioning: 0.15 }
    }
};

const DML_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.10, strength: 0.10, finishing: 0.15, passing: 0.30, dribbling: 0.10 },
        possession: { pace: 0.15, strength: 0.30, passing: 0.90, dribbling: 0.80, positioning: 0.50, composure: 0.15 },
        defense: { pace: 0.25, strength: 0.30, defending: 0.70, positioning: 0.50, composure: 0.25 }
    },
    left: {
        attack: { pace: 0.10, finishing: 0.10, passing: 0.40, dribbling: 0.15 },
        possession: { pace: 0.10, strength: 0.20, passing: 0.70, dribbling: 0.30, positioning: 0.10 },
        defense: { pace: 0.25, strength: 0.25, defending: 0.60, positioning: 0.35, composure: 0.15 }
    },
    right: {
        attack: {},
        possession: { passing: 0.40, dribbling: 0.15 },
        defense: {}
    }
};

const DMR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.10, strength: 0.10, finishing: 0.15, passing: 0.30, dribbling: 0.10 },
        possession: { pace: 0.15, strength: 0.30, passing: 0.90, dribbling: 0.80, positioning: 0.50, composure: 0.15 },
        defense: { pace: 0.25, strength: 0.30, defending: 0.70, positioning: 0.50, composure: 0.25 }
    },
    right: {
        attack: { pace: 0.10, finishing: 0.10, passing: 0.40, dribbling: 0.15 },
        possession: { pace: 0.10, strength: 0.20, passing: 0.70, dribbling: 0.30, positioning: 0.10 },
        defense: { pace: 0.25, strength: 0.25, defending: 0.60, positioning: 0.35, composure: 0.15 }
    },
    left: {
        attack: {},
        possession: { passing: 0.40, dribbling: 0.15 },
        defense: {}
    }
};

// ==========================================
// WIDE MIDFIELDERS
// ==========================================

const LM_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.20, passing: 0.30, dribbling: 0.20, positioning: 0.10 },
        possession: { pace: 0.10, passing: 0.50, dribbling: 0.30, positioning: 0.10 },
        defense: { pace: 0.15, defending: 0.20, positioning: 0.10 }
    },
    left: {
        attack: { pace: 0.50, strength: 0.15, finishing: 0.20, passing: 0.50, dribbling: 0.60, positioning: 0.25 },
        possession: { pace: 0.20, strength: 0.20, passing: 0.60, dribbling: 0.40, positioning: 0.20 },
        defense: { pace: 0.40, strength: 0.15, defending: 0.50, positioning: 0.40 }
    },
    right: {
        attack: { passing: 0.10 },
        possession: { passing: 0.15 },
        defense: {}
    }
};

const RM_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: { pace: 0.20, passing: 0.30, dribbling: 0.20, positioning: 0.10 },
        possession: { pace: 0.10, passing: 0.50, dribbling: 0.30, positioning: 0.10 },
        defense: { pace: 0.15, defending: 0.20, positioning: 0.10 }
    },
    right: {
        attack: { pace: 0.50, strength: 0.15, finishing: 0.20, passing: 0.50, dribbling: 0.60, positioning: 0.25 },
        possession: { pace: 0.20, strength: 0.20, passing: 0.60, dribbling: 0.40, positioning: 0.20 },
        defense: { pace: 0.40, strength: 0.15, defending: 0.50, positioning: 0.40 }
    },
    left: {
        attack: { passing: 0.10 },
        possession: { passing: 0.15 },
        defense: {}
    }
};

// ==========================================
// DEFENDERS
// ==========================================

const LB_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { pace: 0.10, strength: 0.15, passing: 0.60, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.20, strength: 0.20, defending: 0.50, positioning: 0.30, composure: 0.10 }
    },
    left: {
        attack: { pace: 0.30, strength: 0.10, passing: 0.40, dribbling: 0.15 },
        possession: { pace: 0.20, strength: 0.30, passing: 1.00, dribbling: 0.70, positioning: 0.25 },
        defense: { pace: 0.70, strength: 0.60, defending: 1.00, positioning: 0.90, composure: 0.80 }
    },
    right: {
        attack: {},
        possession: {},
        defense: {}
    }
};

const RB_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { pace: 0.10, strength: 0.15, passing: 0.60, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.20, strength: 0.20, defending: 0.50, positioning: 0.30, composure: 0.10 }
    },
    right: {
        attack: { pace: 0.30, strength: 0.10, passing: 0.40, dribbling: 0.15 },
        possession: { pace: 0.20, strength: 0.30, passing: 1.00, dribbling: 0.70, positioning: 0.25 },
        defense: { pace: 0.70, strength: 0.60, defending: 1.00, positioning: 0.90, composure: 0.80 }
    },
    left: {
        attack: {},
        possession: {},
        defense: {}
    }
};

const WB_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { pace: 0.10, strength: 0.10, passing: 0.50, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.15, strength: 0.15, defending: 0.40, positioning: 0.25 }
    },
    left: {
        attack: { pace: 0.70, strength: 0.20, finishing: 0.40, passing: 0.80, dribbling: 0.60, positioning: 0.25 },
        possession: { pace: 0.20, strength: 0.25, passing: 0.80, dribbling: 0.55, positioning: 0.20 },
        defense: { pace: 0.60, strength: 0.45, defending: 0.80, positioning: 0.70, composure: 0.45 }
    },
    right: {
        attack: {},
        possession: {},
        defense: {}
    }
};

const WBR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { pace: 0.10, strength: 0.10, passing: 0.50, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.15, strength: 0.15, defending: 0.40, positioning: 0.25 }
    },
    right: {
        attack: { pace: 0.70, strength: 0.20, finishing: 0.40, passing: 0.80, dribbling: 0.60, positioning: 0.25 },
        possession: { pace: 0.20, strength: 0.25, passing: 0.80, dribbling: 0.55, positioning: 0.20 },
        defense: { pace: 0.60, strength: 0.45, defending: 0.80, positioning: 0.70, composure: 0.45 }
    },
    left: {
        attack: {},
        possession: {},
        defense: {}
    }
};

const CB_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { pace: 0.10, strength: 0.20, passing: 0.60, dribbling: 0.15, positioning: 0.10, composure: 0.05 },
        defense: { pace: 0.50, strength: 0.80, defending: 1.00, positioning: 0.90, composure: 0.60 }
    },
    left: {
        attack: {},
        possession: { strength: 0.15, passing: 0.40, dribbling: 0.10 },
        defense: { pace: 0.25, strength: 0.35, defending: 0.70, positioning: 0.40, composure: 0.15 }
    },
    right: {
        attack: {},
        possession: { strength: 0.15, passing: 0.40, dribbling: 0.10 },
        defense: { pace: 0.25, strength: 0.35, defending: 0.70, positioning: 0.40, composure: 0.15 }
    }
};

// ==========================================
// GOALKEEPER
// ==========================================

const GK_WEIGHTS: GKWeightMatrix = {
    saveRating: {
        gk_reflexes: 4.0,
        gk_handling: 2.5,
        positioning: 2.0,
        composure: 1.5,
        pace: 0.0,
        passing: 0.0,
        dribbling: 0.0,
        finishing: 0.0,
        defending: 0.0,
        strength: 0.0
    }
};

// ==========================================
// Position Weights Export Map
// ==========================================

export const POSITION_WEIGHTS: PositionWeightsMap = {
    // Forwards
    'CF': CF_WEIGHTS,
    'ST': CF_WEIGHTS,
    'CFL': CF_L_WEIGHTS,
    'CFR': CF_R_WEIGHTS,
    'LW': LW_WEIGHTS,
    'RW': RW_WEIGHTS,

    // Attacking Midfielders
    'AM': AM_WEIGHTS,
    'CAM': AM_WEIGHTS,
    'CAM1': AML_WEIGHTS,
    'CAM2': AM_WEIGHTS,
    'CAM3': AMR_WEIGHTS,
    'AML': AML_WEIGHTS,
    'AMR': AMR_WEIGHTS,

    // Wide Midfielders
    'LM': LM_WEIGHTS,
    'RM': RM_WEIGHTS,

    // Central Midfielders
    'CM': CM_WEIGHTS,
    'CM1': CM_WEIGHTS,
    'CM2': CM_WEIGHTS,
    'CM3': CM_WEIGHTS,
    'CML': CML_WEIGHTS,
    'CMR': CMR_WEIGHTS,

    // Defensive Midfielders
    'DM': DM_WEIGHTS,
    'CDM': DM_WEIGHTS,
    'DMF': DM_WEIGHTS,
    'DMF1': DM_WEIGHTS,
    'DMF2': DM_WEIGHTS,
    'DMF3': DM_WEIGHTS,
    'DML': DML_WEIGHTS,
    'DMR': DMR_WEIGHTS,

    // Defenders
    'LB': LB_WEIGHTS,
    'RB': RB_WEIGHTS,
    'WB': WB_WEIGHTS,
    'LWB': WB_WEIGHTS,
    'WBR': WBR_WEIGHTS,
    'RWB': WBR_WEIGHTS,
    'CD': CB_WEIGHTS,
    'CDL': CB_WEIGHTS,
    'CDR': CB_WEIGHTS,
    'CB': CB_WEIGHTS,

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

function computeWeightedSum(attrs: SimulationPlayerAttributes, weights: Partial<SimulationPlayerAttributes>): number {
    let sum = 0;
    for (const [key, weight] of Object.entries(weights)) {
        if (typeof weight === 'number' && key !== 'abilities') {
            sum += getAttrValue(attrs, key) * weight;
        }
    }
    return sum;
}

/**
 * 计算球员在特定位置的适配度评分 (0-100)
 * 基于该位置所有lane和phase的加权技能贡献，取最大值后normalize
 */
export function calculatePositionFit(attrs: SimulationPlayerAttributes, positionKey: string): number {
    const weights = POSITION_WEIGHTS[positionKey];
    if (!weights) return 0;

    if (positionKey === 'GK') {
        const gkWeights = weights as GKWeightMatrix;
        const rawMax = computeWeightedSum({ pace: 20, strength: 20, positioning: 20, composure: 20, freeKicks: 20, penalties: 20, finishing: 20, passing: 20, dribbling: 20, defending: 20, gk_reflexes: 20, gk_handling: 20, gk_distribution: 20 }, gkWeights.saveRating);
        const rawScore = computeWeightedSum(attrs, gkWeights.saveRating);
        if (rawMax === 0) return 0;
        return Math.round((rawScore / rawMax) * 100);
    }

    const posWeights = weights as PositionWeightMatrix;
    let totalRawScore = 0;
    let totalMaxRawScore = 0;
    let count = 0;

    const lanes: (keyof PositionWeightMatrix)[] = ['center', 'left', 'right'];
    const phases: (keyof LaneWeights)[] = ['attack', 'possession', 'defense'];
    const maxAttrs = { pace: 20, strength: 20, positioning: 20, composure: 20, freeKicks: 20, penalties: 20, finishing: 20, passing: 20, dribbling: 20, defending: 20 };

    for (const lane of lanes) {
        const laneData = posWeights[lane];
        if (!laneData) continue;
        for (const phase of phases) {
            const phaseWeights = laneData[phase];
            if (!phaseWeights || Object.keys(phaseWeights).length === 0) continue;
            totalRawScore += computeWeightedSum(attrs, phaseWeights);
            totalMaxRawScore += computeWeightedSum(maxAttrs as SimulationPlayerAttributes, phaseWeights);
            count++;
        }
    }

    if (totalMaxRawScore === 0) return 0;
    return Math.round((totalRawScore / totalMaxRawScore) * 100);
}

/**
 * 获取球员在所有位置的适配度评分报告（按评分降序）
 */
export function getPositionFitReport(attrs: SimulationPlayerAttributes): PositionFitResult[] {
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
export function getBestPosition(attrs: SimulationPlayerAttributes): PositionFitResult {
    const report = getPositionFitReport(attrs);
    return report[0];
}

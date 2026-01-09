import { PlayerAttributes } from '../../types/player.types';

export interface LaneWeights {
    attack: Partial<PlayerAttributes>;
    possession: Partial<PlayerAttributes>;
    defense: Partial<PlayerAttributes>;
}

export interface PositionWeightMatrix {
    center: LaneWeights;
    left: LaneWeights;
    right: LaneWeights;
}

export interface GKWeightMatrix {
    saveRating: Partial<PlayerAttributes> & {
        gk_reflexes?: number;
        gk_handling?: number;
    };
}

export type PositionWeightsMap = {
    [key: string]: PositionWeightMatrix | GKWeightMatrix;
};

// ==========================================
// FORWARDS
// ==========================================

export const CF_WEIGHTS: PositionWeightMatrix = {
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

export const CF_L_WEIGHTS: PositionWeightMatrix = {
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

export const CF_R_WEIGHTS: PositionWeightMatrix = {
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

export const LW_WEIGHTS: PositionWeightMatrix = {
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

export const RW_WEIGHTS: PositionWeightMatrix = {
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

export const AM_WEIGHTS: PositionWeightMatrix = {
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

export const AML_WEIGHTS: PositionWeightMatrix = {
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

export const AMR_WEIGHTS: PositionWeightMatrix = {
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

export const CM_WEIGHTS: PositionWeightMatrix = {
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

export const CML_WEIGHTS: PositionWeightMatrix = {
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

export const CMR_WEIGHTS: PositionWeightMatrix = {
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

export const DM_WEIGHTS: PositionWeightMatrix = {
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

export const DML_WEIGHTS: PositionWeightMatrix = {
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

export const DMR_WEIGHTS: PositionWeightMatrix = {
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

export const LM_WEIGHTS: PositionWeightMatrix = {
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

export const RM_WEIGHTS: PositionWeightMatrix = {
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

export const LB_WEIGHTS: PositionWeightMatrix = {
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

export const RB_WEIGHTS: PositionWeightMatrix = {
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

export const WB_WEIGHTS: PositionWeightMatrix = {
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

export const WBR_WEIGHTS: PositionWeightMatrix = {
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

export const CB_WEIGHTS: PositionWeightMatrix = {
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

export const CBL_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { pace: 0.10, strength: 0.20, passing: 0.60, dribbling: 0.15, positioning: 0.10, composure: 0.05 },
        defense: { pace: 0.50, strength: 0.80, defending: 1.00, positioning: 0.90, composure: 0.60 }
    },
    left: {
        attack: {},
        possession: { pace: 0.10, strength: 0.20, passing: 0.70, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.50, strength: 0.80, defending: 1.00, positioning: 0.85, composure: 0.55 }
    },
    right: {
        attack: {},
        possession: {},
        defense: {}
    }
};

export const CBR_WEIGHTS: PositionWeightMatrix = {
    center: {
        attack: {},
        possession: { pace: 0.10, strength: 0.20, passing: 0.60, dribbling: 0.15, positioning: 0.10, composure: 0.05 },
        defense: { pace: 0.50, strength: 0.80, defending: 1.00, positioning: 0.90, composure: 0.60 }
    },
    right: {
        attack: {},
        possession: { pace: 0.10, strength: 0.20, passing: 0.70, dribbling: 0.20, positioning: 0.10 },
        defense: { pace: 0.50, strength: 0.80, defending: 1.00, positioning: 0.85, composure: 0.55 }
    },
    left: {
        attack: {},
        possession: {},
        defense: {}
    }
};

// ==========================================
// GOALKEEPER (INDEPENDENT)
// ==========================================

export const GK_WEIGHTS: GKWeightMatrix = {
    saveRating: {
        gk_reflexes: 4.0,
        gk_handling: 2.5,
        positioning: 2.0,
        composure: 1.5,
        // All generic fields are 0 by default for GK specific calculations if needed
        pace: 0.0,
        passing: 0.0,
        dribbling: 0.0,
        finishing: 0.0,
        defending: 0.0,
        strength: 0.0
    }
};

// ==========================================
// EXPORT MAP
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
    'CAM': AM_WEIGHTS, // Alias
    'CAM1': AML_WEIGHTS, // Left attacking mid
    'CAM2': AM_WEIGHTS,  // Center attacking mid
    'CAM3': AMR_WEIGHTS, // Right attacking mid
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
    'CDM': DM_WEIGHTS, // Alias
    'DMF': DM_WEIGHTS, // Alias
    'DMF1': DM_WEIGHTS,
    'DMF2': DM_WEIGHTS,
    'DMF3': DM_WEIGHTS,
    'DML': DML_WEIGHTS,
    'DMR': DMR_WEIGHTS,

    // Defenders
    'LB': LB_WEIGHTS,
    'RB': RB_WEIGHTS,
    'WB': WB_WEIGHTS,
    'LWB': WB_WEIGHTS, // Alias
    'WBR': WBR_WEIGHTS,
    'RWB': WBR_WEIGHTS, // Alias
    'CB': CB_WEIGHTS,
    'CB1': CB_WEIGHTS,  // First center back
    'CB2': CB_WEIGHTS,  // Second center back
    'CB3': CB_WEIGHTS,  // Third center back (for 3-back formations)
    'CBL': CBL_WEIGHTS,
    'CBR': CBR_WEIGHTS,

    // Goalkeeper
    'GK': GK_WEIGHTS
};

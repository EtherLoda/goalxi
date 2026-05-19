import { AttackType } from '../types/simulation.types';
import {
  Tempo,
  PitchWidth,
  DefensiveLine,
  TacticsConfig,
} from '../types/tactics-config';

// PitchWidth → lane strength modifiers
// Flanks have 58% natural probability vs center's 42% (ratio ≈ 1.38).
// NARROW: center ×1.12 (moderate boost), flanks ×0.9 (weaker)
// WIDE: center ×0.9 (weaker), flanks ×1.07 (moderate boost)
export const WIDTH_MODIFIERS: Record<
  PitchWidth,
  { left: number; center: number; right: number }
> = {
  [PitchWidth.NARROW]: { left: 0.9, center: 1.12, right: 0.9 },
  [PitchWidth.BALANCED]: { left: 1.0, center: 1.0, right: 1.0 },
  [PitchWidth.WIDE]: { left: 1.07, center: 0.9, right: 1.07 },
};

// DefensiveLine → offside probability + attack/defense multiplier
// LOW: deep block, rarely caught offside, strong defense but slow to transition
// HIGH: high press, frequently caught offside, strong attack but vulnerable behind
export const DEFENSIVE_LINE_MODIFIERS: Record<
  DefensiveLine,
  { offsideProb: number; attackMult: number; defenseMult: number }
> = {
  [DefensiveLine.LOW]: {
    offsideProb: 0.01,
    attackMult: 0.9,
    defenseMult: 1.15,
  },
  [DefensiveLine.MID]: {
    offsideProb: 0.04,
    attackMult: 1.0,
    defenseMult: 1.0,
  },
  [DefensiveLine.HIGH]: {
    offsideProb: 0.15,
    attackMult: 1.1,
    defenseMult: 0.9,
  },
};

// Tempo → attack type weights + duel stability + counter vulnerability (±20% effect)
// SLOW: methodical build-up, prefer short passes, stable but fewer shots
// FAST: direct transitions, prefer through/dribble, more attempts but less stable
export const TEMPO_MODIFIERS: Record<
  Tempo,
  {
    attackTypeWeights: Record<keyof typeof AttackType, number>;
    duelK: number;
    shotAttempts: number;
    counterVulnerability: number;
  }
> = {
  [Tempo.SLOW]: {
    // Short-pass oriented, minimal risk
    attackTypeWeights: {
      CROSS: 0.9,
      SHORT_PASS: 1.2,
      THROUGH_PASS: 0.8,
      DRIBBLE: 0.8,
      LONG_SHOT: 0.7,
    },
    duelK: 0.42, // More stable, fewer turnovers
    shotAttempts: 0.9, // Fewer but slightly higher quality
    counterVulnerability: 1.15, // Slightly more vulnerable when losing possession
  },
  [Tempo.BALANCED]: {
    attackTypeWeights: {
      CROSS: 1.0,
      SHORT_PASS: 1.0,
      THROUGH_PASS: 1.0,
      DRIBBLE: 1.0,
      LONG_SHOT: 1.0,
    },
    duelK: 0.5,
    shotAttempts: 1.0,
    counterVulnerability: 1.0,
  },
  [Tempo.FAST]: {
    // Direct play, more turnovers but more attempts
    attackTypeWeights: {
      CROSS: 0.9,
      SHORT_PASS: 0.8,
      THROUGH_PASS: 1.2,
      DRIBBLE: 1.2,
      LONG_SHOT: 0.9,
    },
    duelK: 0.58, // More turnover-prone
    shotAttempts: 1.1, // More attempts
    counterVulnerability: 0.85, // Turns over ball frequently, but less exposed on counters
  },
};

export const DEFAULT_TACTICS: TacticsConfig = {
  tempo: Tempo.BALANCED,
  pitchWidth: PitchWidth.BALANCED,
  defensiveLine: DefensiveLine.MID,
};

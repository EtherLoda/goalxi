import {
  PitchWidth,
  DefensiveLine,
  TacticsConfig,
} from '../types/tactics-config';

// PitchWidth → lane strength modifiers (attack / defense / possession all share)
// Flanks have 58% natural probability vs center's 42% (ratio ≈ 1.38).
// NARROW: center ×1.10 (moderate boost), flanks ×0.9 (weaker)
// WIDE: center ×0.87 (weaker), flanks ×1.07 (moderate boost)
export const WIDTH_MODIFIERS: Record<
  PitchWidth,
  { left: number; center: number; right: number }
> = {
  [PitchWidth.NARROW]: { left: 0.9, center: 1.1, right: 0.9 },
  [PitchWidth.BALANCED]: { left: 1.0, center: 1.0, right: 1.0 },
  [PitchWidth.WIDE]: { left: 1.07, center: 0.87, right: 1.07 },
};

// DefensiveLine → offside probability + attack/defense multiplier
// LOW: deep block, rarely caught offside, strong defense but slow to transition
// HIGH: high press, frequently caught offside, strong attack but vulnerable behind
//
// RESERVED — `offsideProb` is NOT consumed by the engine.
// `MatchEngine` never emits an `offside` event; the values below are the
// originally designed per-line offside rate, waiting for the offside mechanic
// to be specified (who is offside, at which point of the sequence, what
// happens to possession, whether it consumes the key moment). Do NOT wire it
// up as a bare roll against these numbers — that changes match balance and
// would need its own calibration pass. Kept here so the design intent is not
// lost. (`MatchEventType.OFFSIDE` exists for the same reason.)
export const DEFENSIVE_LINE_MODIFIERS: Record<
  DefensiveLine,
  { offsideProb: number; attackMult: number; defenseMult: number }
> = {
  [DefensiveLine.LOW]: {
    offsideProb: 0.01,
    attackMult: 0.92,
    defenseMult: 1.11,
  },
  [DefensiveLine.MID]: {
    offsideProb: 0.04,
    attackMult: 1.0,
    defenseMult: 1.0,
  },
  [DefensiveLine.HIGH]: {
    offsideProb: 0.15,
    attackMult: 1.08,
    defenseMult: 0.89,
  },
};

// Tempo（比赛节奏）已于 2026-10-18 整体移除，见
// `simulator/src/engine/types/tactics-config.ts` 的 TacticsConfig 注释。
// 删除时它只有两个参数真正生效（推进曲线陡峭度、进攻方式权重），另外
// 两个（shotAttempts、counterVulnerability）没有任何读取点。宽度和防线
// 各自还有一个参数（DEFENSIVE_LINE_MODIFIERS.offsideProb）留在原地待
// 未来的越位机制使用。

export const DEFAULT_TACTICS: TacticsConfig = {
  pitchWidth: PitchWidth.BALANCED,
  defensiveLine: DefensiveLine.MID,
};

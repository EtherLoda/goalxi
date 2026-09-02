// 比赛节奏
export enum Tempo {
  SLOW = 'slow',
  BALANCED = 'balanced',
  FAST = 'fast',
}

// 球场宽度
export enum PitchWidth {
  NARROW = 'narrow',
  BALANCED = 'balanced',
  WIDE = 'wide',
}

// 防线高度
export enum DefensiveLine {
  LOW = 'low',
  MID = 'mid',
  HIGH = 'high',
}

/**
 * 战术变化的触发条件 — 跟 simulator/src/engine/types/simulation.types.ts
 * 的 `EventCondition` 镜像。两个 workspace 不共享类型,字符串字面量必须保持
 * 一致(否则引擎读不到 condition,会回退到 `always`)。
 *
 *   always       — 不管比分,到了时间就触发(隐式默认)
 *   leading      — 只在领先时触发
 *   trailing     — 只在落后时触发
 *   tied         — 只在平局时触发
 *   notLeading   — 落后或平局时触发
 *   notTrailing  — 领先或平局时触发
 */
export enum EventCondition {
  ALWAYS = 'always',
  LEADING = 'leading',
  TRAILING = 'trailing',
  TIED = 'tied',
  NOT_LEADING = 'notLeading',
  NOT_TRAILING = 'notTrailing',
}

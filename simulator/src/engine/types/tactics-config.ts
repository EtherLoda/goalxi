import { TeamTacticCode } from '@goalxi/database';

export enum PitchWidth {
  NARROW = 'narrow',
  BALANCED = 'balanced',
  WIDE = 'wide',
}

export enum DefensiveLine {
  LOW = 'low',
  MID = 'mid',
  HIGH = 'high',
}

export interface TacticsConfig {
  /**
   * 比赛节奏（tempo）已于 2026-10-18 整体移除：它从未进入产品计划，
   * 且引擎侧四个参数里有两个是死参数（`shotAttempts` 无读取点、
   * `counterVulnerability` 乘进的变量在断球路径上不再被读）。现在
   * 一支球队能调的比赛参数只有宽度、防线和球队战术三项。
   */
  pitchWidth: PitchWidth;
  defensiveLine: DefensiveLine;
  /**
   * 球队战术（2026-10-18）。可选：不填 = 不选战术 = 全中性风格，
   * 与引入战术系统之前的行为完全一致。
   *
   * 战术的阵型要求与候选列表在 `@goalxi/database` 的
   * `team-tactics.constants.ts`（API 与 FE 共用）；战术的实际效果在
   * `simulator/src/engine/tactics/team-tactics.ts`。
   *
   * 要求是否满足由 API 在提交时校验（引擎信任上游输入，不重复校验）。
   */
  teamTactic?: TeamTacticCode | null;
}

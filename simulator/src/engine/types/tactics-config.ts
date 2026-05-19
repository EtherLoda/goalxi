export enum Tempo {
  SLOW = 'slow',
  BALANCED = 'balanced',
  FAST = 'fast',
}

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
  tempo: Tempo;
  pitchWidth: PitchWidth;
  defensiveLine: DefensiveLine;
}

/**
 * match-verdict — pure derivation of a one-line match verdict and the
 * three-lane comparison bars.
 *
 * Kept out of the component so it can be tested without a DOM: `web`'s jest
 * runs in the node environment, so anything worth asserting has to live in a
 * plain module.
 *
 * Every claim the verdict makes is read off a number that the engine
 * recorded. There is no narrative here that the stats cannot support — if
 * nothing separates the two sides, the verdict says so.
 */

export interface LaneStrength {
  attack: number;
  defense: number;
  possession: number;
}

export type LaneKey = 'left' | 'center' | 'right';

export interface VerdictSide {
  name: string;
  goals: number;
  shotsOnTarget: number;
  possessionPct: number;
  lanes: Record<LaneKey, LaneStrength>;
}

export interface VerdictInput {
  home: VerdictSide;
  away: VerdictSide;
}

export interface VerdictSentence {
  /** i18n key suffix under `matches.verdict`. */
  key:
    | 'wonOnLane'
    | 'possessionButLost'
    | 'clinical'
    | 'tight'
    | 'even';
  params: Record<string, string | number>;
}

export interface LaneBar {
  lane: LaneKey;
  /** Net edge for the home side; positive means home was better. */
  net: number;
  /** Share of the bar the home side owns, 0..1. 0.5 is even. */
  homeShare: number;
  homeAttack: number;
  awayAttack: number;
  homePossession: number;
  awayPossession: number;
}

/** Below this the two lanes are statistically the same lane. */
const LANE_NOISE = 0.35;
/** A possession edge worth commenting on, in percentage points. */
const POSSESSION_STORY = 10;
/** An on-target gap worth calling clinical, in shots. */
const CLINICAL_GAP = 2;

/**
 * Per-lane net advantage: what the home side's attack gained over the away
 * defence, minus what the away side's attack gained over the home defence.
 * Comparing raw attack numbers would reward the side that happened to face a
 * weaker opposite lane.
 */
export function laneNet(
  home: Record<LaneKey, LaneStrength>,
  away: Record<LaneKey, LaneStrength>,
  lane: LaneKey,
): number {
  const homeEdge = home[lane].attack - away[lane].defense;
  const awayEdge = away[lane].attack - home[lane].defense;
  return homeEdge - awayEdge;
}

export function laneBars(input: VerdictInput): LaneBar[] {
  const lanes: LaneKey[] = ['left', 'center', 'right'];
  const nets = lanes.map((lane) => laneNet(input.home.lanes, input.away.lanes, lane));
  const peak = Math.max(...nets.map((n) => Math.abs(n)), 0.001);

  return lanes.map((lane, i) => {
    const net = nets[i];
    return {
      lane,
      net,
      homeShare: 0.5 + (net / peak) * 0.5,
      homeAttack: input.home.lanes[lane].attack,
      awayAttack: input.away.lanes[lane].attack,
      homePossession: input.home.lanes[lane].possession,
      awayPossession: input.away.lanes[lane].possession,
    };
  });
}

/**
 * The verdict. Order matters: a side that dominated the ball and lost is the
 * more interesting story than the lane it lost down, so that rule fires
 * first.
 */
export function deriveVerdict(input: VerdictInput): VerdictSentence {
  const { home, away } = input;
  const homeWon = home.goals > away.goals;
  const awayWon = away.goals > home.goals;
  const winner = homeWon ? home : awayWon ? away : null;
  const loser = homeWon ? away : awayWon ? home : null;

  // 1. Possession without reward.
  const possGap = Math.abs(home.possessionPct - away.possessionPct);
  if (possGap >= POSSESSION_STORY) {
    const dominant = home.possessionPct > away.possessionPct ? home : away;
    const dominantLost = winner !== null && dominant.name === loser?.name;
    if (dominantLost) {
      return {
        key: 'possessionButLost',
        params: { team: dominant.name, pct: Math.round(dominant.possessionPct) },
      };
    }
  }

  // 2. A lane that separated them.
  const bars = laneBars(input);
  const decisive = bars.reduce((best, bar) =>
    Math.abs(bar.net) > Math.abs(best.net) ? bar : best,
  );
  if (winner && Math.abs(decisive.net) >= LANE_NOISE) {
    return {
      key: 'wonOnLane',
      params: {
        team: winner.name,
        lane: decisive.lane,
        edge: Math.abs(decisive.net).toFixed(1),
      },
    };
  }

  // 3. Clinical finishing.
  const onTargetGap = Math.abs(home.shotsOnTarget - away.shotsOnTarget);
  if (winner && onTargetGap >= CLINICAL_GAP) {
    return {
      key: 'clinical',
      params: {
        team: winner.name,
        onTarget: winner.shotsOnTarget,
        goals: winner.goals,
      },
    };
  }

  // 4. Nothing separated the lanes or the shot quality.
  if (winner && Math.abs(home.goals - away.goals) === 1) {
    return { key: 'tight', params: { team: winner.name } };
  }
  if (winner) {
    return {
      key: 'clinical',
      params: {
        team: winner.name,
        onTarget: winner.shotsOnTarget,
        goals: winner.goals,
      },
    };
  }
  return { key: 'even', params: {} };
}

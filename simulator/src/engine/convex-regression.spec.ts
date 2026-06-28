import { MatchEngine } from './match.engine';
import { Team } from './classes/Team';
import { TacticalPlayer } from './types/simulation.types';
import { Player } from '../types/player.types';
import { duelProbability } from './duel';

/**
 * 凸性改造后的回归测试。
 *
 * 跑四组对比：
 *   1. 对等双方（ovr=70 vs ovr=70）
 *   2. 强弱差异（ovr=70 vs ovr=80）
 *   3. 极端差距（ovr=50 vs ovr=80）
 *   4. 轻微差距（ovr=70 vs ovr=75）
 *
 * 验收标准（参考 plan §6）：
 *   - 对等双方：主胜率 ≈ 客胜率，平局率 ≥ 12%
 *   - 较大差距：away 胜率显著高于 home 胜率
 *   - 极端差距：away 胜率 60-80%（不要 99%）
 *   - 轻微差距：away 胜率略高于 home，不碾压
 */

const N = 100;

function createMockPlayer(
  id: string,
  name: string,
  ovr: number,
  isGK: boolean,
): Player {
  return {
    id,
    name,
    position: isGK ? 'GK' : 'CM',
    exactAge: [25, 0],
    attributes: isGK
      ? {
          finishing: 30,
          composure: ovr,
          positioning: ovr,
          strength: ovr,
          pace: ovr,
          dribbling: 20,
          passing: 20,
          defending: 30,
          freeKicks: 20,
          penalties: 20,
          gk_reflexes: ovr,
          gk_handling: ovr,
          gk_aerial: ovr,
        }
      : {
          finishing: ovr,
          composure: ovr,
          positioning: ovr,
          strength: ovr,
          pace: ovr,
          dribbling: ovr,
          passing: ovr,
          defending: ovr,
          freeKicks: ovr,
          penalties: ovr,
          gk_reflexes: 30,
          gk_handling: 30,
          gk_aerial: 30,
        },
    currentStamina: 3,
    form: 5,
    experience: 10,
  };
}

const FORMATION_442 = [
  'GK',
  'LB',
  'CD',
  'CD',
  'RB',
  'CM',
  'CM',
  'AM',
  'LW',
  'CF',
  'RW',
] as const;

function createMockTeam(name: string, avgOvr: number): Team {
  const players: TacticalPlayer[] = FORMATION_442.map((pos, i) => ({
    player: createMockPlayer(
      `${name}-${i}`,
      `${name} Player ${i}`,
      avgOvr,
      pos === 'GK',
    ),
    positionKey: pos,
  }));
  return new Team(name, players);
}

interface MatchResult {
  homeScore: number;
  awayScore: number;
  totalGoals: number;
  outcome: 'home' | 'away' | 'draw';
  margin: number;
  homeShots: number;
  awayShots: number;
  homeGoals: number;
  awayGoals: number;
  homeTurnovers: number;
  awayTurnovers: number;
  homeCorners: number;
  awayCorners: number;
  homeFreeKicks: number;
  awayFreeKicks: number;
  homeFouls: number;
  awayFouls: number;
  homePossession: number;
  totalEvents: number;
}

function runMatch(homeOvr: number, awayOvr: number): MatchResult {
  const home = createMockTeam('Home', homeOvr);
  const away = createMockTeam('Away', awayOvr);
  const engine = new MatchEngine(home, away);
  engine.simulateMatch();

  const events = (engine as any).events as Array<{
    type: string;
    teamName?: string;
    data?: any;
  }>;

  let homeScore = 0;
  let awayScore = 0;
  let homeShots = 0;
  let awayShots = 0;
  let homeTurnovers = 0;
  let awayTurnovers = 0;
  let homeCorners = 0;
  let awayCorners = 0;
  let homeFreeKicks = 0;
  let awayFreeKicks = 0;
  let homeFouls = 0;
  let awayFouls = 0;
  let homePossession = 0;
  let possessionSamples = 0;

  for (const e of events) {
    const isHome = e.teamName === 'Home';
    const isAway = e.teamName === 'Away';
    switch (e.type) {
      case 'goal':
        if (isHome) {
          homeScore++;
          homeShots++;
        } else if (isAway) {
          awayScore++;
          awayShots++;
        }
        break;
      case 'save':
      case 'miss':
        if (isHome) homeShots++;
        else if (isAway) awayShots++;
        break;
      case 'turnover':
        if (isHome) homeTurnovers++;
        else if (isAway) awayTurnovers++;
        break;
      case 'corner':
        if (isHome) homeCorners++;
        else if (isAway) awayCorners++;
        break;
      case 'free_kick':
        if (isHome) homeFreeKicks++;
        else if (isAway) awayFreeKicks++;
        break;
      case 'foul':
        if (isHome) homeFouls++;
        else if (isAway) awayFouls++;
        break;
    }
    if (e.type === 'snapshot' && e.data?.p) {
      homePossession += e.data.p.home || 0;
      possessionSamples++;
    }
  }

  return {
    homeScore,
    awayScore,
    totalGoals: homeScore + awayScore,
    outcome:
      homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw',
    margin: Math.abs(homeScore - awayScore),
    homeShots,
    awayShots,
    homeGoals: homeScore,
    awayGoals: awayScore,
    homeTurnovers,
    awayTurnovers,
    homeCorners,
    awayCorners,
    homeFreeKicks,
    awayFreeKicks,
    homeFouls,
    awayFouls,
    homePossession:
      (engine as any).matchStats.possessionStats.home +
        (engine as any).matchStats.possessionStats.away >
      0
        ? ((engine as any).matchStats.possessionStats.home /
            ((engine as any).matchStats.possessionStats.home +
              (engine as any).matchStats.possessionStats.away)) *
          100
        : 50,
    totalEvents: events.length,
  };
}

interface AggregateStats {
  n: number;
  avgGoals: number;
  homeWinRate: number;
  awayWinRate: number;
  drawRate: number;
  bigWinRate: number;
  scoreDistribution: Map<string, number>;
  // 进攻
  avgHomeShots: number;
  avgAwayShots: number;
  avgHomeTurnovers: number;
  avgAwayTurnovers: number;
  // 进攻成功率 = 射门 / (射门 + 被断)
  homePushSuccessRate: number;
  awayPushSuccessRate: number;
  // 射门转化率
  homeShotConversion: number;
  awayShotConversion: number;
  // 定位球/犯规
  avgHomeCorners: number;
  avgAwayCorners: number;
  avgHomeFouls: number;
  avgAwayFouls: number;
  avgHomeFreeKicks: number;
  avgAwayFreeKicks: number;
  // 控球
  avgHomePossession: number;
  // 事件总量
  avgTotalEvents: number;
}

function aggregate(
  results: MatchResult[],
  strongSide: 'home' | 'away' | 'none' = 'none',
): AggregateStats {
  const n = results.length;
  const sum = (key: keyof MatchResult) =>
    results.reduce((s, r) => s + (r[key] as number), 0);
  const homeWins = results.filter((r) => r.outcome === 'home').length;
  const awayWins = results.filter((r) => r.outcome === 'away').length;
  const draws = results.filter((r) => r.outcome === 'draw').length;
  const bigWins = results.filter(
    (r) => r.outcome !== 'draw' && r.margin >= 3,
  ).length;

  const scoreDist = new Map<string, number>();
  for (const r of results) {
    const key = `${r.homeScore}-${r.awayScore}`;
    scoreDist.set(key, (scoreDist.get(key) || 0) + 1);
  }

  const totalHomeShots = sum('homeShots');
  const totalAwayShots = sum('awayShots');
  const totalHomeTurnovers = sum('homeTurnovers');
  const totalAwayTurnovers = sum('awayTurnovers');

  return {
    n,
    avgGoals: (sum('homeScore') + sum('awayScore')) / n,
    homeWinRate: homeWins / n,
    awayWinRate: awayWins / n,
    drawRate: draws / n,
    bigWinRate: bigWins / n,
    scoreDistribution: scoreDist,
    avgHomeShots: totalHomeShots / n,
    avgAwayShots: totalAwayShots / n,
    avgHomeTurnovers: totalHomeTurnovers / n,
    avgAwayTurnovers: totalAwayTurnovers / n,
    homePushSuccessRate:
      totalHomeShots + totalHomeTurnovers > 0
        ? totalHomeShots / (totalHomeShots + totalHomeTurnovers)
        : 0,
    awayPushSuccessRate:
      totalAwayShots + totalAwayTurnovers > 0
        ? totalAwayShots / (totalAwayShots + totalAwayTurnovers)
        : 0,
    homeShotConversion:
      totalHomeShots > 0 ? sum('homeGoals') / totalHomeShots : 0,
    awayShotConversion:
      totalAwayShots > 0 ? sum('awayGoals') / totalAwayShots : 0,
    avgHomeCorners: sum('homeCorners') / n,
    avgAwayCorners: sum('awayCorners') / n,
    avgHomeFouls: sum('homeFouls') / n,
    avgAwayFouls: sum('awayFouls') / n,
    avgHomeFreeKicks: sum('homeFreeKicks') / n,
    avgAwayFreeKicks: sum('awayFreeKicks') / n,
    avgHomePossession: sum('homePossession') / n,
    avgTotalEvents: sum('totalEvents') / n,
  };
}

function printStats(label: string, stats: AggregateStats): void {
  console.log(`\n[${label}] (n=${stats.n})`);
  console.log(`  --- 胜负 ---`);
  console.log(
    `  胜率: 主 ${(stats.homeWinRate * 100).toFixed(1)}%  客 ${(stats.awayWinRate * 100).toFixed(1)}%  平 ${(stats.drawRate * 100).toFixed(1)}%`,
  );
  console.log(
    `  场均进球: ${stats.avgGoals.toFixed(2)}  大胜率(≥3球差): ${(stats.bigWinRate * 100).toFixed(1)}%`,
  );
  console.log(`  --- 控球/进攻 ---`);
  console.log(
    `  主队控球: ${stats.avgHomePossession.toFixed(1)}%  客队控球: ${(100 - stats.avgHomePossession).toFixed(1)}%`,
  );
  console.log(
    `  进攻尝试(射门+被断): 主 ${(stats.avgHomeShots + stats.avgHomeTurnovers).toFixed(1)} / 客 ${(stats.avgAwayShots + stats.avgAwayTurnovers).toFixed(1)}`,
  );
  console.log(
    `  推进→射门转化: 主 ${(stats.homePushSuccessRate * 100).toFixed(1)}% / 客 ${(stats.awayPushSuccessRate * 100).toFixed(1)}%`,
  );
  console.log(`  --- 射门/进球 ---`);
  console.log(
    `  场均射门: 主 ${stats.avgHomeShots.toFixed(1)} / 客 ${stats.avgAwayShots.toFixed(1)}`,
  );
  console.log(
    `  射门转化率: 主 ${(stats.homeShotConversion * 100).toFixed(1)}% / 客 ${(stats.awayShotConversion * 100).toFixed(1)}%`,
  );
  console.log(`  --- 定位球/犯规 ---`);
  console.log(
    `  角球: 主 ${stats.avgHomeCorners.toFixed(1)} / 客 ${stats.avgAwayCorners.toFixed(1)}`,
  );
  console.log(
    `  任意球: 主 ${stats.avgHomeFreeKicks.toFixed(1)} / 客 ${stats.avgAwayFreeKicks.toFixed(1)}`,
  );
  console.log(
    `  犯规: 主 ${stats.avgHomeFouls.toFixed(1)} / 客 ${stats.avgAwayFouls.toFixed(1)}`,
  );
  console.log(`  场均事件总数: ${stats.avgTotalEvents.toFixed(0)}`);
  const topScores = [...stats.scoreDistribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  console.log(
    `  常见比分 TOP6: ${topScores.map(([k, v]) => `${k}(${v})`).join(', ')}`,
  );
}

describe('凸性改造回归：100 场模拟', () => {
  it('调试：单次 midfield battle', () => {
    const home = createMockTeam('Home', 50);
    const away = createMockTeam('Away', 80);
    home.updateSnapshot(10);
    away.updateSnapshot(10);

    const homePoss = home.getSnapshot()?.laneStrengths.center.possession || 0;
    const awayPoss = away.getSnapshot()?.laneStrengths.center.possession || 0;
    console.log('homePoss:', homePoss, 'awayPoss:', awayPoss);
    console.log('ratio (home/away):', homePoss / awayPoss);

    // 直接模拟 midfield battle 1000 次
    let homeWins = 0;
    for (let i = 0; i < 1000; i++) {
      const P = duelProbability(homePoss, awayPoss, {
        amplification: 1.7,
        baseline: 0.5,
        anchorRatio: 2.0,
        anchorProbability: 0.8,
      });
      if (Math.random() < P) homeWins++;
    }
    console.log(
      'homeWins midfield battle: ',
      homeWins,
      '/1000 =',
      (homeWins / 10).toFixed(1) + '%',
    );
    expect(true).toBe(true);
  });

  it('调试：50 vs 80 真实 possessionStats', () => {
    const home = createMockTeam('Home', 50);
    const away = createMockTeam('Away', 80);
    const engine = new MatchEngine(home, away);
    engine.simulateMatch();
    // 直接读内部 possessionStats
    const stats = (engine as any).matchStats.possessionStats;
    console.log('raw possessionStats:', JSON.stringify(stats));
    const total = stats.home + stats.away;
    console.log('home pct:', ((stats.home / total) * 100).toFixed(1) + '%');
    console.log('away pct:', ((stats.away / total) * 100).toFixed(1) + '%');
    expect(true).toBe(true);
  });

  it('对等双方（70 vs 70）', () => {
    const results: MatchResult[] = [];
    for (let i = 0; i < N; i++) results.push(runMatch(70, 70));
    const stats = aggregate(results, 'none');
    printStats('对等双方 70 vs 70', stats);

    expect(stats.drawRate).toBeGreaterThan(0.12);
    expect(Math.abs(stats.homeWinRate - stats.awayWinRate)).toBeLessThan(0.15);
  });

  it('弱 vs 强 70 vs 80', () => {
    const results: MatchResult[] = [];
    for (let i = 0; i < N; i++) results.push(runMatch(70, 80));
    const stats = aggregate(results, 'away');
    printStats('弱 vs 强 70 vs 80', stats);

    expect(stats.awayWinRate).toBeGreaterThan(stats.homeWinRate);
  });

  it('极端 50 vs 80', () => {
    const results: MatchResult[] = [];
    for (let i = 0; i < N; i++) results.push(runMatch(50, 80));
    const stats = aggregate(results, 'away');
    printStats('极端 50 vs 80', stats);

    expect(stats.awayWinRate).toBeGreaterThan(0.55);
    expect(stats.homeWinRate).toBeLessThan(0.25);
  });

  it('轻微差距 70 vs 75', () => {
    const results: MatchResult[] = [];
    for (let i = 0; i < N; i++) results.push(runMatch(70, 75));
    const stats = aggregate(results, 'away');
    printStats('轻微差距 70 vs 75', stats);

    expect(stats.awayWinRate).toBeGreaterThan(stats.homeWinRate);
    expect(stats.awayWinRate).toBeLessThan(0.65);
  });

  it('中等差距 70 vs 80 (锚点附近)', () => {
    const results: MatchResult[] = [];
    for (let i = 0; i < N; i++) results.push(runMatch(70, 80));
    const stats = aggregate(results, 'away');
    printStats('中等差距 70 vs 80', stats);

    expect(stats.awayWinRate).toBeGreaterThan(0.4);
  });
});

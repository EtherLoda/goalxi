import {
  POSITION_FAMILIES,
  POSITION_KEYS,
  PositionKey,
  TACTIC_REQUIREMENTS,
  TEAM_TACTIC_CODES,
  TeamTacticCode,
  checkTacticRequirement,
} from '@goalxi/database';
import { Team } from '../classes/Team';
import { MatchEngine } from '../match.engine';
import { NEUTRAL_STYLE } from '../style';
import { DefensiveLine, PitchWidth, Tempo } from '../types/tactics-config';
import { resolveTeamTacticStyle } from './team-tactics';

/**
 * 球队战术的两半：`@goalxi/database` 里的**要求表**、`./team-tactics` 里的
 * **效果表**。这里把两半都当被测对象：
 *  - 要求表必须每个战术恰好 4 个受约束位置，且能被真实阵型满足；
 *  - 效果表必须落在 `StyleModifiers` 已有的字段上，且不选战术时是全中性。
 */
describe('team tactics — 要求表与效果表', () => {
  const FORMATIONS: Record<TeamTacticCode, PositionKey[]> = {
    // 4-3-3：三中场 + 一个边锋
    [TeamTacticCode.POSSESSION]: [
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'CM',
      'CM',
      'CM',
      'LW',
      'CF',
      'RW',
    ],
    // 4-2-3-1：两个边前腰 + 中锋 + 一个中卫
    [TeamTacticCode.HIGH_PRESS]: [
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'DM',
      'DM',
      'AML',
      'AM',
      'AMR',
      'CF',
    ],
    // 4-4-2 低位：四后卫
    [TeamTacticCode.COUNTER]: [
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'LM',
      'CM',
      'CM',
      'RM',
      'CF',
      'CF',
    ],
    // 4-1-2-1-2 菱形：后腰 + 两中场 + 前腰
    [TeamTacticCode.CENTRAL]: [
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'DM',
      'CM',
      'CM',
      'AM',
      'CF',
      'CF',
    ],
    // 4-4-2 双翼：两翼 + 两边后卫
    [TeamTacticCode.WINGS]: [
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'LM',
      'CM',
      'CM',
      'RM',
      'CF',
      'CF',
    ],
  };

  it('每个战术恰好约束 4 个场上位置', () => {
    for (const code of TEAM_TACTIC_CODES) {
      const total = TACTIC_REQUIREMENTS[code].reduce(
        (sum, requirement) => sum + requirement.count,
        0,
      );
      expect(`${code}:${total}`).toBe(`${code}:4`);
    }
  });

  it('位置族表覆盖全部 31 个槽位', () => {
    for (const key of POSITION_KEYS) {
      expect(POSITION_FAMILIES[key]).toBeTruthy();
    }
  });

  it('每个战术都有一个能天然满足它的阵型', () => {
    for (const code of TEAM_TACTIC_CODES) {
      const check = checkTacticRequirement(code, FORMATIONS[code]);
      expect(`${code}:${check.ok}:${check.missing.length}`).toBe(
        `${code}:true:0`,
      );
    }
  });

  it('不满足时返回缺哪个位置族、缺几个', () => {
    // 4-4-2 没有前腰也没有后腰：中路渗透缺 DM×1 和 AM×1。
    const fourFourTwo: PositionKey[] = [
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'LM',
      'CM',
      'CM',
      'RM',
      'CF',
      'CF',
    ];
    const check = checkTacticRequirement(TeamTacticCode.CENTRAL, fourFourTwo);
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([
      { families: ['DM'], count: 1 },
      { families: ['AM'], count: 1 },
    ]);

    // 三中场阵容也不能满足传控压迫之外的东西。
    const possession = checkTacticRequirement(
      TeamTacticCode.POSSESSION,
      FORMATIONS[TeamTacticCode.CENTRAL],
    );
    expect(possession.ok).toBe(false);
  });

  it('同一位置不会被两条要求重复占用', () => {
    // 只有 2 个中场，但传控压迫要 3 个 —— 不能靠把同一个 CM 数两次通过。
    const onlyTwoCms: PositionKey[] = [
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'CM',
      'CM',
      'LM',
      'RM',
      'CF',
      'CF',
    ];
    const check = checkTacticRequirement(
      TeamTacticCode.POSSESSION,
      onlyTwoCms,
    );
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([{ families: ['CM'], count: 1 }]);
  });

  it('不选战术时是全中性风格', () => {
    expect(resolveTeamTacticStyle(null)).toEqual(NEUTRAL_STYLE);
    expect(resolveTeamTacticStyle(undefined)).toEqual(NEUTRAL_STYLE);
  });

  it('每个战术都至少改一个有引擎读取者的字段', () => {
    for (const code of TEAM_TACTIC_CODES) {
      const style = resolveTeamTacticStyle(code);
      const diff = Object.entries(style).filter(
        ([key, value]) => value !== NEUTRAL_STYLE[key as keyof typeof style],
      );
      expect(`${code}:${diff.length > 0}`).toBe(`${code}:true`);
      // 全局型：不允许出现按位置族的加成。
      expect(style.positionFamilyMultipliers).toBeUndefined();
    }
  });

  it('构造器把战术写进 Team.style（不经过引擎内部任何一步）', () => {
    const build = () => new Team('H', [], 0, 'h');
    const engine = new MatchEngine(
      build(),
      new Team('A', [], 0, 'a'),
      [],
      [],
      new Map(),
      null,
      null,
      'cloudy',
      {
        tempo: Tempo.BALANCED,
        pitchWidth: PitchWidth.BALANCED,
        defensiveLine: DefensiveLine.MID,
        teamTactic: TeamTacticCode.POSSESSION,
      },
      {
        tempo: Tempo.BALANCED,
        pitchWidth: PitchWidth.BALANCED,
        defensiveLine: DefensiveLine.MID,
        teamTactic: null,
      },
    );

    expect(engine.homeTeam.style.possessionControl).toBeCloseTo(1.12, 10);
    expect(engine.awayTeam.style).toEqual(NEUTRAL_STYLE);
  });
});

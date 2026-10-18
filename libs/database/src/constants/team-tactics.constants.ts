import type { PositionKey } from './position-keys.constants';

/**
 * 球队战术（Team Tactic）—— 单一定义源。
 *
 * 一个战术由两部分组成：
 *
 *   1. **要求**（本文件）：必须有几个位置落在哪些位置族里。这是硬门槛，
 *      不满足就不能选这个战术。它同时承担「这个战术要什么样的阵型」
 *      这一层含义，所以不需要再给每个位置单独写加成。
 *   2. **效果**（`simulator/src/engine/tactics/team-tactics.ts`）：
 *      一组**全局**风格修正，作用于整队，不按位置族加权。
 *
 * 设计要求（2026-10-18 与维护者确认）：
 *   - 每个战术**恰好 4 个**受约束的场上位置，剩下 7 个自由。位置总数是
 *     10（场上除门将外），4 是个能体现差异性、又不至于把玩家阵型锁死的数。
 *   - 效果**只做全局**，不做按位置族的加成。原因有两个：一是按族加成会和
 *     换人 / 场上移位指令交互出「倍率跟人还是跟位置」的歧义；二是要求本身
 *     已经把「哪些位置重要」讲清楚了。
 *   - 效果只能落在引擎已有的风格面上（`StyleModifiers`），不引入新机制。
 *
 * 球员可见文案不要写这里的数字（见 CLAUDE.md「不暴露引擎内部」）。
 */

/** 五个战术的稳定标识。存库和 API 传输都用这里的值。 */
export enum TeamTacticCode {
  /** 传控压迫：把球权和场地都压到对方半场，用控球和耐心寻找机会。 */
  POSSESSION = 'possession',
  /** 高位逼抢：前场就开始抢，用断球和转换制造机会。 */
  HIGH_PRESS = 'high_press',
  /** 防守反击：让出球权，靠拦截和快速向前打身后。 */
  COUNTER = 'counter',
  /** 中路渗透：从中路密集区域用直塞打穿防线。 */
  CENTRAL = 'central',
  /** 双翼齐飞：把进攻铺到两边，靠传中和边路人数优势。 */
  WINGS = 'wings',
}

/**
 * 位置族。是 `PositionKey`（31 个具体槽位）的上一层归类 ——
 * 玩家看到的是「3 个中场」，不是「CML/CM/CMR 各一个」。
 */
export type PositionFamily =
  | 'GK'
  | 'CB'
  | 'FB'
  | 'DM'
  | 'CM'
  | 'AM'
  | 'W'
  | 'CF';

/** 槽位 → 位置族。表必须覆盖 `PositionKey` 全量（类型会强制检查）。 */
export const POSITION_FAMILIES: Readonly<Record<PositionKey, PositionFamily>> =
  {
    CBL: 'CB',
    CB: 'CB',
    CBR: 'CB',
    LB: 'FB',
    RB: 'FB',
    LWB: 'FB',
    RWB: 'FB',
    DML: 'DM',
    DM: 'DM',
    DMR: 'DM',
    CML: 'CM',
    CM: 'CM',
    CMR: 'CM',
    AML: 'AM',
    AM: 'AM',
    AMR: 'AM',
    LM: 'W',
    RM: 'W',
    LW: 'W',
    RW: 'W',
    CFL: 'CF',
    CF: 'CF',
    CFR: 'CF',
    GK: 'GK',
  };

/**
 * 旧槽位别名 → 位置族。
 *
 * 为什么需要这一张表：`POSITION_KEYS` 已经统一到 DML/DM/DMR 与 AML/AM/AMR，
 * 但前端 `PITCH_SLOTS` 和历史 `match_tactics.lineupV2` 里仍然是
 * DMFL/CAML/CAM 这些旧名字（引擎在 `SLOT_KEY_NORMALIZER` 里把它们折回
 * 规范键）。如果校验只看规范键，用旧槽位排出的阵容会被判成"一个位置都
 * 没有"，战术永远不可用 —— 而且报错信息还会说缺 4 个位置，玩家完全看不懂。
 *
 * 这张表只用于"读"（校验 / 展示），规范键仍是唯一写入目标。
 */
const LEGACY_SLOT_FAMILIES: Readonly<Record<string, PositionFamily>> = {
  ST: 'CF',
  CD: 'CB',
  CDL: 'CB',
  CDR: 'CB',
  CAM: 'AM',
  CAML: 'AM',
  CAMR: 'AM',
  CDM: 'DM',
  DMF: 'DM',
  DMFL: 'DM',
  DMFR: 'DM',
  DM1: 'DM',
  DM2: 'DM',
  DM3: 'DM',
  WBL: 'FB',
  WBR: 'FB',
  LB1: 'FB',
  RB1: 'FB',
  LM1: 'W',
  LM2: 'W',
  RM1: 'W',
  RM2: 'W',
  LW1: 'W',
  LW2: 'W',
  RW1: 'W',
  RW2: 'W',
  CF_LW: 'CF',
  CF_RW: 'CF',
};

/**
 * 槽位（规范键或旧别名）→ 位置族；认不出来（替补槽位、拼错的值）返回
 * `null`，调用方据此跳过而不是猜。
 *
 * 注意别名只做一层折叠：`WBL` → FB 而不是"边翼卫"这样的独立族。战术要求
 * 的粒度就是八个族，多一层只会让玩家更难预期。
 */
export function positionFamilyOf(slot: string): PositionFamily | null {
  const canonical = POSITION_FAMILIES[slot as PositionKey];
  if (canonical) return canonical;
  return LEGACY_SLOT_FAMILIES[slot] ?? null;
}

/** 一条要求：`count` 个槽位必须落在 `families` 里的任意一族。 */
export interface TacticSlotRequirement {
  readonly families: readonly PositionFamily[];
  readonly count: number;
}

/**
 * 每个战术的阵型要求。五条要求合计各 4 个受约束位置。
 *
 * 设计上刻意让五个战术的要求**互不重叠**（除了 HIGH_PRESS 的 {AM,W}
 * 与 WINGS 的 W、COUNTER 与 WINGS 的 FB 共享位置族），这样玩家能靠
 * 排阵型表达战术倾向，而不是每次换战术都要重排全队。
 */
export const TACTIC_REQUIREMENTS: Readonly<
  Record<TeamTacticCode, readonly TacticSlotRequirement[]>
> = {
  /* 传控压迫：中场人数是控球的前提，再加一个能在中场和锋线之间游走的人。 */
  [TeamTacticCode.POSSESSION]: [
    { families: ['CM'], count: 3 },
    { families: ['AM', 'W'], count: 1 },
  ],
  /* 高位逼抢：两个前场球员负责第一道压迫，一个中锋负责封后腰，一个中卫提到中线。 */
  [TeamTacticCode.HIGH_PRESS]: [
    { families: ['AM', 'W'], count: 2 },
    { families: ['CF'], count: 1 },
    { families: ['CB'], count: 1 },
  ],
  /* 防守反击：四后卫是基础，靠人数堆出低位防线。 */
  [TeamTacticCode.COUNTER]: [
    { families: ['CB'], count: 2 },
    { families: ['FB'], count: 2 },
  ],
  /* 中路渗透：一个后腰保护，两个中场推进，一个前腰做最后一传。 */
  [TeamTacticCode.CENTRAL]: [
    { families: ['DM'], count: 1 },
    { families: ['CM'], count: 2 },
    { families: ['AM'], count: 1 },
  ],
  /* 双翼齐飞：两翼 + 两个上前助攻的边后卫。 */
  [TeamTacticCode.WINGS]: [
    { families: ['W'], count: 2 },
    { families: ['FB'], count: 2 },
  ],
};

/** 全部战术代码（顺序即 FE 展示顺序）。 */
export const TEAM_TACTIC_CODES: readonly TeamTacticCode[] = [
  TeamTacticCode.POSSESSION,
  TeamTacticCode.HIGH_PRESS,
  TeamTacticCode.COUNTER,
  TeamTacticCode.CENTRAL,
  TeamTacticCode.WINGS,
];

export function isTeamTacticCode(value: unknown): value is TeamTacticCode {
  return (
    typeof value === 'string' &&
    (TEAM_TACTIC_CODES as readonly string[]).includes(value)
  );
}

/**
 * 用一组场上槽位（11 个，含 GK）检查是否满足战术要求。
 *
 * 入参是**字符串**而不是 `PositionKey[]`：API 层拿到的是 JSON 里的槽位名，
 * 里面可能混着旧别名（`DMFL`/`CAML`）甚至替补槽位。用 `positionFamilyOf`
 * 逐个折叠，认不出的槽位直接不计入（替补不算场上位置）。
 *
 * 贪心实现是精确的：五套要求内部互不共享同一族的剩余名额
 * （POSSESSION 的 {AM,W} 只和它自己的 CM×3 相邻但与 CM 不相交；
 * HIGH_PRESS 的 {AM,W} 与 CF/CB 不相交），所以按顺序逐条扣减不会
 * 出现「先扣了后面要用的槽位」。
 *
 * 返回值带上缺口，方便 API 直接拼错误信息、FE 直接显示还差什么。
 */
export interface TacticRequirementCheck {
  readonly ok: boolean;
  readonly missing: readonly TacticSlotRequirement[];
}

export function checkTacticRequirement(
  code: TeamTacticCode,
  slotKeys: readonly string[],
): TacticRequirementCheck {
  const available = new Map<PositionFamily, number>();
  for (const key of slotKeys) {
    const family = positionFamilyOf(key);
    if (!family) continue;
    available.set(family, (available.get(family) ?? 0) + 1);
  }

  const missing: TacticSlotRequirement[] = [];
  for (const requirement of TACTIC_REQUIREMENTS[code]) {
    let remaining = requirement.count;
    for (const family of requirement.families) {
      if (remaining === 0) break;
      const have = available.get(family) ?? 0;
      const use = Math.min(have, remaining);
      if (use > 0) {
        available.set(family, have - use);
        remaining -= use;
      }
    }
    if (remaining > 0) {
      missing.push({ families: requirement.families, count: remaining });
    }
  }

  return { ok: missing.length === 0, missing };
}

---
order: 4
slug: player-attributes
title: 球员:其他属性
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 3, 5, 18, 19]
relatedEntries: [pwi-vs-overall, current-vs-potential-skills, potential-tier-meaning, experience-meaning, specialties-meaning, condition-form-injury]
---

# 球员:其他属性

技能(第 2 章)和位置(第 3 章)是球员的"硬指标",但场上表现还受一组**其他属性**影响。这章讲这些"软指标":

- **PWI / overall** — 综合评分(把硬指标 + 软指标汇总成一个数)
- **currentSkills vs potentialSkills** — 雷达图双线(实线 vs 虚线)
- **potentialTier** — 5 档潜力标签
- **form** — 短期状态
- **experience / 等级** — 长期"老练度"
- **condition / stamina** — 比赛中体能
- **injury** — 伤病状态
- **specialties** — 12 种 + 3 档(GOLD / SILVER / BRONZE)
- **age** — 年龄(无衰减机制,影响长期规划)

> 这些属性跟技能(第 2 章)+ 位置(第 3 章)**正交**——一个球员可以 PWI 极高但受伤中(form 好也没用),或技能爆表但 35 岁(experience 高但 PWI 已经被衰退系统压)。

---

## PWI / overall — 综合评分

**PWI = Player Worth Index** = 球员综合分。雷达图旁边、球员卡上、转会市场、球探报告里都看得到。

**跟 overall 的关系**:**PWI = overall**,接口同时返回两个字段,值完全相等。`pwiDisplay` 是 UI 上四舍五入到 10 的整数倍(例 4772 → 4770)。

**PWI 由三个因素综合决定**(定性):

1. **当前技能(currentSkills)** — 主导因素。头牌技能高 → PWI 高
2. **潜力(potentialAbility)** — 放大因子。**同样技能下,潜力高的球员 PWI 上限更高**(潜力低的球员涨到顶也就那样)
3. **form** — 微调。form 高时 PWI 略高,form 低时略低

> **PWI 高 ≠ 场上一定好**。两个 PWI 相同的球员,放在不同位置踢,实际表现天差地别(position 权重不同)。看 PWI 永远要结合**位置**([第 3 章](03-positions.md))。

**什么时候看 PWI**:
- 转会市场比价(PWI 越高,起拍价 / 工资越高)
- 球探报告(球探给的 PWI 范围,大概判断球员实力档)
- 阵容总览(快速扫一眼球队核心球员的 PWI 分布)

---

## currentSkills vs potentialSkills — 雷达图双线

雷达图上每项技能有 **2 条线**:
- **实线** = `currentSkills`(当前能力,场上实际表现)
- **虚线** = `potentialSkills`(潜力上限,涨到这就不长了)

**两线距离 = 还能涨多少**:
- **senior 球员**:两线几乎重合(已长完)
- **youth 球员**:差距大(还在长,每周 0-2 项可能提升)

涨到 `potentialSkills` 就到顶(不会超过虚线)。**潜在技能的值由潜力决定**,currentSkills 涨到顶后停。

**怎么涨**:
- **比赛** — 比赛后引擎按场上表现给技能 +1(在潜力范围内)
- **训练** — 周四按训练类别涨
- **青训 reveal** — youth 球员每周围棋式揭示 1 项技能(被雾化隐藏的技能,reveal 后才能涨)

详细见 [第 2 章](02-player-skills.md) "技能怎么涨"段。

---

## potentialTier — 5 档潜力档

5 档潜力标签,跟**当前能力**无关,代表**球员的天花板**:
- **LOW**(灰)— 潜力低,练到顶也基本是替补
- **REGULAR**(绿)— 标准,大多数 outfield 主力水平
- **HIGH_PRO**(金)— 高潜,练满是顶级
- **HIGH_PRO** 跟 21 档 tier 标签不一样:
  - **potentialTier** 是 5 档"潜力档",标在球员卡的"潜力"位置
  - **tier label** 是 21 档"当前技能/经验档",标在雷达图每项技能旁边
  - **名字像,不是同一套**——别混

> youth 球员的 potentialTier 被 revealLevel 雾化,要 reveal 一定数量技能才能看到。

---

## form — 短期状态

**form = 短期状态**,影响 PWI 显示和场上表现。范围 **0-5**,默认 **3.0**,3.0 是基准。

**怎么看**:
- **雷达图 / 球员卡** 上显示 "状态箭头"(`↑ / → / ↓`)
- form 高 → PWI 显示略高 / 场上表现好
- form 低 → PWI 显示略低 / 场上表现差

**form 怎么变**:
- **比赛** — 表现好涨,表现差跌
- **训练** — 训练能影响
- **累积比赛分钟** — 长期不打比赛 form 会下降

**什么时候看 form**:
- **短期决策**(这赛季争冠) → form 极重要,看 form 买人
- **长期决策** → form 波动可以忽略,看潜力 + 经验

---

## experience / 等级 — 长期"老练度"

**experience = 累计 XP**,每场比赛结束涨。**等级** = `getExperienceLevel(totalExp)`,从 0 起,**无上限**。

**升级成本**(`getExperienceUpgradeCost`):**线性**,每级 +2 XP
- L0 → L1 需 10 XP
- L1 → L2 需 12 XP
- L2 → L3 需 14 XP
- ...
- L5 → L6 需 20 XP
- ...

**21 档 tier 标签**:经验 ≥ 某个值时显示对应 tier(具体见 [附录 3](A3-tier-labels.md))。**L20 封顶显示**——内部等级还能继续涨,但 tier 标签不会超过 `L20 化境`。
- 鼠标悬停 → 看 raw XP
- L20 以上的球员,UI 看起来都标"化境",raw XP 用来区分

**经验怎么涨**(按比赛类型倍率):
- 国家队 **5x**(涨最快,顶 5 场联赛)
- 季后赛 2x
- 联赛 / 杯赛 1x(基准)
- 友谊赛 0.1x(几乎不涨)
- 锦标赛 0(不算)

踢满 90 分钟 = 拿满基础经验;踢 45 分钟只拿一半;替补 10 分钟几乎不涨。

**老将红利**(为什么经验高值钱):
- 引擎按 raw XP(不是 tier 标签)算 multiplier
- **`calculatePenaltyMultiplier`** + **`getMultiplierWithFitnessFactor`** 都用 raw XP
- **官方注释**:"Penalty specific multiplier: Ignores stamina, high experience bonus."
- **结论**:**老将踢点球更稳**,不受体力影响

详细见 [附录 3](A3-tier-labels.md) "怎么读 - 经验"段。

---

## condition / stamina — 比赛中体能

**condition = 比赛中当前体力**,**stamina = 比赛初始体力**。

**生命周期**:
- 比赛开始时 stamina = 100%
- 比赛中持续消耗(跑动、对抗、扑救、动作都耗)
- 体力低时**场上表现下降**(低于某个阈值有 penalty,阈值不透露)
- **节间休息**(中场 15 分钟)**不恢复**
- 换人后**新球员体力 100%**
- 比赛后:**stamina 回到 100%**(下一场重新来)

**怎么看**:
- 比赛直播时,球员卡上显示**体力条**(绿色 / 黄色 / 红色)
- 实时变化,不用看雷达

**stamina 跟 form / experience 的区别**:
- stamina 是**比赛内**的(影响当前场表现)
- form 是**跨比赛**的(影响 PWI)
- experience 是**长期**的(影响老将红利)

---

## injury — 伤病状态

球员有**当前伤病**状态(`injuryState` 字段),**3 种状态**:

| 状态 | 含义 | 表现 |
|---|---|---|
| `null` / 健康 | 没伤 | 正常出场 |
| `minor` | 轻伤 | 可上场,**能力下降** |
| `severe` | 重伤 | **不能上场** |

**伤病类型**(`injuryType`,5 种):
- `muscle`(肌肉)
- `ligament`(韧带)
- `joint`(关节)
- `head`(头部)
- `other`(其他)

**严重程度** = `currentInjuryValue`(int,引擎内部字段,**不显示**):
- 轻伤 = 几天的恢复期
- 重伤 = 几周的恢复期
- 引擎按 value 倒计时恢复,每天扣 1

**伤病怎么产生**:
- 比赛事件触发(铲断受伤、过度使用等)
- 长期不休息可能累积

**伤病怎么看 / 用**:
- 球员卡 / 详情页有"伤病"状态
- severe 伤病**不能进首发**(阵容按钮被锁)
- 重大伤病有"伤病记录"事件(`INJURY` event)

**实战意义**:
- 买人前看伤病史(`INJURY` 事件多 = 玻璃人,慎买)
- 比赛日 severe 伤病强制换人
- minor 伤病球员上不上自己看(能力下降多少 = 风险)

---

## specialties — 12 种 + 3 档

**specialties = 球员的"身份标签"**,影响特定比赛事件的引擎加成。**12 个 active 特性**,每个都有引擎钩子。

### 12 种特性(适合位置 / 触发事件)

| 特性 | 中文 | 适合位置 | 触发事件 |
|---|---|---|---|
| `AERIAL_THREAT` | 空霸 | CB / CF | 头球、争顶 |
| `DRIBBLER` | 过人王 | W / AM | 1v1 过人 |
| `PLAYMAKER` | 组织者 | AM / CM | 直塞、最后一传 |
| `TACKLER` | 抢断王 | CB / DM | 抢断、铲断 |
| `WALL` | 铁墙 | CB / DM | 防守封堵 |
| `SPEEDSTER` | 快马 | W | 反击推进 |
| `CROSSER` | 传中王 | W / LB | 边路传中 |
| `POACHER` | 机会主义 | CF | 抢点、捡漏 |
| `COMPOSED` | 冷静 | CF / AM | 单刀处理 |
| `PHYSICAL_BEAST` | 野兽 | CB / CF | 身体对抗 |
| `SAVING_MASTER` | 扑救大师 | GK | 关键扑救 |
| `SWEEPER_KEEPER` | 出击型门将 | GK | 出击封堵 |

**3 档 tier**:
- **GOLD**(金)— 加成最大
- **SILVER**(银)— 中等
- **BRONZE**(铜)— 最小

**特性关键事实**:
- **~50% 球员没有特性**(另一半随机分配)
- **tier 跟技能无关** — 是生成时随机定的
- **每场只取最强的** — 球队多个相同特性也只算最强的
- **跟位置/战术挂钩** — 跟战术搭配的 specialty 是 bonus

**实战意义**:
- 头牌 + 强特性 = 真核心
- GOLD 特性值溢价
- 找特定位置时看**对应位置的最佳特性**:
  - W 找 `DRIBBLER` / `SPEEDSTER` / `CROSSER`
  - CB 找 `TACKLER` / `AERIAL_THREAT` / `WALL` / `PHYSICAL_BEAST`
  - AM 找 `PLAYMAKER` / `DRIBBLER` / `COMPOSED`
  - CF 找 `POACHER` / `AERIAL_THREAT` / `COMPOSED` / `PHYSICAL_BEAST`
  - GK 找 `SAVING_MASTER` / `SWEEPER_KEEPER`

---

## age — 年龄(无衰减机制)

**`age` 字段 = 球员年龄**(整数,从 `createdDay` 算)。

**重要事实**:**GoalXI 当前没有年龄衰减机制**。35+ 岁老将**不会**因为年龄自然掉技能,只有 [第 2 章](02-player-skills.md) 提到的"35+ 岁衰退"系统在跑(周一后台),跟年龄本身不是一回事。

**age 跟其他属性的关系**:
- **跟 experience 正相关** — 踢得久经验自然高(老将 = 高经验)
- **跟 PWI / 技能** 无直接关系(衰退系统是按年龄触发,但只挂"35+"这个开关)
- **跟 form** 无直接关系

**age 唯一作用**:
- 显示在球员卡 / 详情页(让你知道球员多"老")
- 触发 35+ 岁衰退系统的开关(后台跑)
- 长期规划参考(年轻 = 还有潜力,老 = 经验红利期)

> **GoalXI 的年龄不像 Hattrick / FM 那样"老了就掉属性"**。老将只要没伤 / form 还可以,场上一样猛。

---

## 11 个属性总览

| 属性 | 类型 | 影响 | 怎么涨 / 怎么掉 | 在哪看 |
|---|---|---|---|---|
| **PWI** | 综合 | 球员总评(转会、球探、阵容总览) | 3 因素:技能 + 潜力 + form | 球员卡、转会市场、雷达图旁 |
| **currentSkills** | 当前 | 场上实际表现 | 比赛 + 训练 | 雷达图实线 |
| **potentialSkills** | 潜力 | 技能上限 | 不可改(出生时定) | 雷达图虚线 |
| **potentialTier** | 5 档标签 | 长期价值判断 | 不可改 | 球员卡"潜力"位置 |
| **form** | 短期状态 | PWI 显示 + 场上发挥 | 比赛 / 训练 / 累计分钟 | 球员卡"状态箭头" |
| **experience** | 长期积累 | PWI 因子 + 老将红利 | 比赛(5x 国家 / 2x 季后赛 / 1x 联赛 / 0.1x 友谊) | 球员卡"EXP" + 21 档 tier |
| **condition** | 比赛中体能 | 当前场表现 | 比赛消耗 / 换人恢复 | 比赛直播体力条 |
| **injury** | 伤病状态 | 可上场 / 能力 | 比赛事件触发 / 倒计时恢复 | 球员卡"伤病"位置 |
| **specialties** | 特性 | 事件触发加成 | 不可改(出生时定) | 球员卡"特性"位置 |
| **age** | 数值 | 触发 35+ 衰退系统 | 不可改(由 createdDay 算) | 球员卡"年龄"位置 |
| **nationality** | ISO 国家码 | 国家队 / 风格倾向 | 不可改 | 球员卡"国籍"位置(目前**无影响**) |

---

## 跟其他概念的关系

| 概念 | 关系 |
|---|---|
| **技能**(第 2 章) | 头牌技能 + 潜力 + form = PWI;currentSkills vs potentialSkills 双线 |
| **位置**(第 3 章) | PWI 高 ≠ 适合任意位置,位置权重不同 |
| **tier 标签**(附录 3) | experience 用 21 档 tier 显示,L20 封顶 |
| **potentialTier 5 档**(本章) | 跟 21 档 tier 标签**不是同一套**,别混 |
| **特殊事件**(第 6 章) | INJURY 事件 + HAT_TRICK 等 14 种事件类型 |
| **转会**(第 18 章) | 买人看 PWI + 伤病史 + form + potentialTier |
| **青训**(第 19 章) | youth 球员 reveal 技能 + form 漂移 |

---

## 常见错误(关于属性)

❌ **PWI 高 = 强球员**:**PWI 高只是综合分高**,头牌不对位置 = 场上隐身
❌ **不看 potentialSkills 差距**:**潜力高不等于还能涨**,看 currentSkills 跟 potentialSkills 的 gap
❌ **追 perfect 球员**:**LEGEND + 满技能 + 健康 + 年轻 + 便宜 = 不存在**
❌ **忽视 form 波动**:**form < 1.5 时买便宜**(伤后恢复期,可能反弹)
❌ **把 potentialTier 跟 21 档 tier 混**:**5 档潜力 ≠ 21 档当前档,两套**
❌ **以为 age = 衰退**:**age 本身没衰减机制**,衰退系统是"35+"开关
❌ **GK 看 pace / strength / 定位球**:**没用**(GK 算分不走这些)
❌ **minor 伤病当没事上**:**能力下降**,关键比赛别赌
❌ **只追 GOLD 特性**:**没有特性 + 头牌高 > GOLD 特性 + 头牌低**

---

## 接下来

- [第 2 章:球员:技能](02-player-skills.md) — 技能怎么涨 / 怎么掉
- [第 3 章:球员:位置](03-positions.md) — 14 个位置 + 头牌技能
- [第 5 章:阵容:基本认识](05-lineup-basics.md) — 怎么用这些属性排阵容
- [第 6 章:比赛:基本信息](06-match-basics.md) — 比赛里这些属性怎么用
- [第 18 章:转会交易](18-transfer.md) — 买人看哪些属性
- [第 19 章:青年球员](19-youth.md) — youth 球员的 reveal / form 漂移
- [附录 3:球员等级标签](A3-tier-labels.md) — 21 档 tier 完整表

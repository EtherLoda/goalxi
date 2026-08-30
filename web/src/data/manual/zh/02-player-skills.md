---
order: 2
slug: player-skills
title: 球员:技能
status: full
lastUpdated: 2026-08-30
relatedChapters: [3, 4, 14, 17]
relatedEntries: [outfield-skills-meaning, gk-skills-vs-outfield, skill-dimensions-note, skill-priority-w, skill-priority-cb, skill-priority-cm-dm-am, skill-priority-cf, skill-priority-gk]
---

# 球员:技能

每个球员的"场上能力"由一组 0-20 的技能数值定义。

- **outfield 球员** 10 项技能(分 4 维度)
- **GK 球员** 9 项技能(8 项跟 outfield 重叠,3 项 GK 专属)

每项技能 **0-20**,默认 **10**。数值越高,球员在相应场景下的表现越好。雷达图上每项技能都会显示数值 + tier 标签。

> 这一章解决两个问题:**这 19 项技能都是什么** + **雷达图上的 21 档标签怎么读**。每个位置重视哪些技能(头牌 vs 几乎不影响)在 [第 4 章:阵容:基本认识](04-lineup-basics.md) 详细讲。

## 数值范围 + 双线

- **范围**:每项技能 0-20,默认 10(10 是"中等"水平,既不强也不弱)
- **雷达图双线**:
  - **实线** = `currentSkills`(当前能力,场上实际表现)
  - **虚线** = `potentialSkills`(潜力上限,涨到这就不长了)

两线距离 = 还能涨多少。senior 球员两线几乎重合(已长完),youth 球员差距大(还在长)。

---

## outfield 球员:10 项技能

4 维度分组:**physical(2) + technical(4) + mental(2) + setPieces(2)** = 10 项。

### physical — 身体

| 技能 | 场上行为 | 哪些位置重视 |
|---|---|---|
| **pace**(速度) | 推进、追防线身后、抢回身位 | 边锋头牌 / 中场次要 / 中后卫次要 |
| **strength**(力量) | 身体对抗、头球争顶、扛人 | 中后卫头牌 / 中锋次要 / 防守中场次要 |

### technical — 技术

| 技能 | 场上行为 | 哪些位置重视 |
|---|---|---|
| **finishing**(射门) | 终结、禁区打门 | 中锋头牌 / 边锋次要 / 前腰次要 |
| **passing**(传球) | 直塞、长传、传中、转移 | 前腰 / 中前卫头牌 / 边锋次要 |
| **dribbling**(盘带) | 1v1 摆脱、过人下底/内切 | 边锋头牌 / 前腰次要 |
| **defending**(防守) | 抢断、卡位、铲断、拦截 | 中后卫头牌 / 防守中场次要 / 边后卫次要 |

### mental — 心理

| 技能 | 场上行为 | 哪些位置重视 |
|---|---|---|
| **positioning**(跑位) | 站位、协防、前插抢点、无球跑动 | 中后卫次要 / 防守中场次要 / 中锋次要(抢点) |
| **composure**(冷静) | 单刀处理、压力下不失误、关键球镇定 | 中锋次要 / 前腰次要 |

### setPieces — 定位球

| 技能 | 场上行为 | 哪些位置重视 |
|---|---|---|
| **freeKicks**(任意球) | 直接任意球主罚质量 | 跟位置无关,看主罚手 |
| **penalties**(点球) | 点球主罚质量 | 跟位置无关,看主罚手 |

---

## GK 门将:9 项技能

4 维度分组(跟 outfield 共享 8 项,3 项 GK 专属):

### physical — 身体

| 技能 | 场上行为 | 重要性 |
|---|---|---|
| **pace**(速度) | (无明显场上影响) | 几乎不影响 GK 评分 |
| **strength**(力量) | (无明显场上影响) | 几乎不影响 GK 评分 |

### technical — GK 专属(替换 outfield 的 4 项)

| 技能 | 场上行为 | 重要性 |
|---|---|---|
| **reflexes**(反应) | 扑救反应,近距离射门扑不扑得到 | **极重要**(GK 头牌之一) |
| **handling**(接球) | 接稳球,高空球摘取不脱手 | **极重要**(GK 头牌之一) |
| **aerial**(高空) | 高空球摘取(出击/门内) | 重要 |

### mental — 心理

| 技能 | 场上行为 | 重要性 |
|---|---|---|
| **positioning**(站位) | 站位、封角度、站对位置扑救难度降低 | 重要 |
| **composure**(冷静) | 冷静不脱手、关键扑救镇定 | 次要 |

### setPieces — 定位球

| 技能 | 场上行为 | 重要性 |
|---|---|---|
| **freeKicks** | 跟位置无关 | 跟位置无关 |
| **penalties** | 跟位置无关 | 跟位置无关 |

> GK 的 `pace` 和 `strength` 在雷达图上会有数值,但**实际算分时不参与 GK 评分**。一个 pace 18 的 GK 跟 pace 10 的 GK,场上表现没差。找 GK **只看 reflexes / handling / aerial / positioning / composure 这 5 项**。

---

## 21 档 tier 标签

每项技能 0-20 的数值,会显示成 **tier 标签**(雷达图上、技能面板上、球员卡上)。这套标签跟球员**经验等级共用同一套**(L0-L20):

| 数值 | L | 中文 | 英文 |
|---|---|---|---|
| 0 | L0 | 无 | None |
| 1 | L1 | 糟糕 | Terrible |
| 2 | L2 | 差劲 | Poor |
| 3 | L3 | 平庸 | Mediocre |
| 4 | L4 | 一般 | Average |
| 5 | L5 | 合格 | Competent |
| 6 | L6 | 差强人意 | Satisfactory |
| 7 | L7 | 良好 | Good |
| 8 | L8 | 优秀 | Excellent |
| 9 | L9 | 强大 | Formidable |
| 10 | L10 | 杰出 | Outstanding |
| 11 | L11 | 精湛 | Superb |
| 12 | L12 | 顶尖 | Apex |
| 13 | L13 | 卓越 | Superior |
| 14 | L14 | 超一流 | World-Class |
| 15 | L15 | 卓绝 | Magnificent |
| 16 | L16 | 出类拔萃 | Exceptional |
| 17 | L17 | 举世无双 | Peerless |
| 18 | L18 | 登峰造极 | Unmatched |
| 19 | L19 | 空前绝后 | Transcendent |
| 20 | L20 | 化境 | Beyond Compare |

**怎么读**:
- 技能 18 的 player = 雷达图上看到 `L18 登峰造极`,数值 18
- 技能 5 的 player = `L5 合格`,几乎可以忽略
- 球员的 10/9 项技能**每一项**都有独立 tier 标签(不是综合)

---

## 技能怎么涨 / 怎么掉

| 来源 | 怎么影响 | 详细章节 |
|---|---|---|
| **比赛** | 比赛后引擎按场上表现给技能 +1(潜力内) | [第 5 章](05-match-basics.md) |
| **训练** | 周四按你定的训练类别涨,5 选 1 | [第 6 章](06-training.md) |
| **衰退** | 35+ 岁的老将,周一可能被削一点(后台跑) | [第 3 章](03-player-attributes.md) |
| **青训 reveal** | youth 球员每周围棋式揭示 1 项技能 | [第 18 章](18-youth-and-scouts.md) |
| **转会** | 买的球员 currentSkills 固定(对方青年队 / 球探挑的) | [第 17 章](17-transfer.md) |

**封顶**:涨到 `potentialSkills` 就到顶(虚线位置)。Senior 球员潜力已经定型,youth 球员的 currentSkills 涨到 potentialSkills 后停止。

**不会自然降**:
- 当前技能不会因为不打比赛掉,**只有衰退(老将)+ 严重伤病** 才可能掉
- 训练**不会降**技能(只升)

---

## 位置 vs 技能:不通用

**同样的技能,在不同位置价值天差地别**。雷达图上看着全面均衡的球员,放错位置可能全场隐身。

**几个典型例子**:
- 边锋(W):**pace + dribbling 头牌**,defending 几乎没用
- 中后卫(CB):**defending 头牌**,dribbling / finishing 几乎没用
- 中锋(CF):**finishing + positioning 头牌**,defending 几乎没用
- 防守中场(DM):**defending + positioning 头牌**,finishing 几乎没用
- 中前卫(CM):**passing + defending 平衡**,纯进攻头牌少
- 前腰(AM):**passing + dribbling 头牌**,defending 几乎没用
- GK:**reflexes + handling 头牌**,pace / strength 几乎没用

**怎么知道某个位置看哪几项**:见 [第 4 章:阵容:基本认识](04-lineup-basics.md) + FAQ 的 `skill-priority-w` / `skill-priority-cb` / `skill-priority-cm-dm-am` / `skill-priority-cf` / `skill-priority-gk` 各位置头牌表。

---

## 跟其他概念的关系

| 概念 | 关系 |
|---|---|
| **PWI / overall**(第 3 章) | 头牌技能 + 潜力 + form 综合算的**综合分**,不是技能的简单加和 |
| **position**(第 4 章) | 决定哪些技能被引擎"加权"用 |
| **form**(第 3 章) | 短期状态,跟技能数值正交(form 高技能不一定高) |
| **experience / 等级**(第 3 章) | 长期"老练度",跟技能正交(老将不一定技能高) |
| **potentialSkills**(第 3 章) | 技能的天花板,涨到这停 |
| **specialties**(第 3 章) | 触发引擎事件加成的特性标签,跟具体技能无关 |

---

## 常见错误

❌ **跨位置比技能**:`W` 的 defending 18 跟 `CB` 的 defending 18 **意义不同** — 位置权重不同,前者几乎没用,后者是头牌
❌ **看雷达图"全面均衡"就觉得球员强**:雷达图均衡只说明技能分布均匀,**不等于 PWI 高**;真正强不强看 PWI
❌ **追求每项技能都高**:技能有上限 + 工资约束,真实球员都有强项有弱项,**强项对位置就够用**
❌ **忽视 4 维度的分组**:21 档 tier 标签不分组(都从 L0 到 L20),但**实际技能类型不同** — pace 20 的体能跟 reflexes 20 的扑救反应**不是同一种"强"**
❌ **以为 GK 也能用 pace / strength 抢分**:**没用**,GK 算分不走 pace / strength,找 GK 别看这俩

---

## 接下来

- [第 3 章:球员:其他属性](03-player-attributes.md) — PWI / form / EXP / 伤病 / specialty
- [第 4 章:阵容:基本认识](04-lineup-basics.md) — 14 个位置家族,位置怎么挑球员
- [第 5 章:比赛:基本信息](05-match-basics.md) — 比赛怎么用这些技能
- [第 6 章:训练](06-training.md) — 怎么涨技能
- [第 14 章:比赛:战术](14-tactics.md) — 战术怎么调度技能

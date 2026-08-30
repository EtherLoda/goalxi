---
order: 2
slug: player-skills
title: 球员:技能
status: full
lastUpdated: 2026-08-30
relatedChapters: [3, 4, 14, 15]
relatedEntries: [outfield-skills-meaning, gk-skills-vs-outfield, skill-dimensions-note, skill-priority-w, skill-priority-cb, skill-priority-cm-dm-am, skill-priority-cf, skill-priority-gk]
---

# 球员:技能

每个球员的"场上能力"由一组 0-20 的技能数值定义。

- **outfield 球员** 10 项技能(分 4 维度)
- **GK 球员** 9 项技能(8 项跟 outfield 重叠,3 项 GK 专属)

每项技能 **0-20**,默认 **10**。数值越高,球员在相应场景下的表现越好。雷达图上每项技能都会显示**数值 + 21 档 tier 标签**(标签见 [附录 3:球员等级标签](A3-tier-labels.md))。

> 这一章讲**每项技能是什么**。**每个位置重视哪些技能** 见 [第 3 章:球员:位置](03-positions.md)。**雷达图上的 21 档标签怎么读** 见 [附录 3](A3-tier-labels.md)。

## 数值范围 + 双线

- **范围**:每项技能 0-20,默认 10(10 是"中等"水平)
- **雷达图双线**:
  - **实线** = `currentSkills`(当前能力,场上实际表现)
  - **虚线** = `potentialSkills`(潜力上限,涨到这就不长了)

两线距离 = 还能涨多少。senior 球员两线几乎重合(已长完),youth 球员差距大(还在长)。

---

## outfield 球员:10 项技能

4 维度分组:**physical(2) + technical(4) + mental(2) + setPieces(2)** = 10 项。

### physical — 身体

| 技能 | 场上行为 |
|---|---|
| **pace**(速度) | 推进、追防线身后、抢回身位 |
| **strength**(力量) | 身体对抗、头球争顶、扛人 |

### technical — 技术

| 技能 | 场上行为 |
|---|---|
| **finishing**(射门) | 终结、禁区打门 |
| **passing**(传球) | 直塞、长传、传中、转移 |
| **dribbling**(盘带) | 1v1 摆脱、过人下底 / 内切 |
| **defending**(防守) | 抢断、卡位、铲断、拦截 |

### mental — 心理

| 技能 | 场上行为 |
|---|---|
| **positioning**(跑位) | 站位、协防、前插抢点、无球跑动 |
| **composure**(冷静) | 单刀处理、压力下不失误、关键球镇定 |

### setPieces — 定位球

| 技能 | 场上行为 |
|---|---|
| **freeKicks**(任意球) | 直接任意球主罚质量 |
| **penalties**(点球) | 点球主罚质量 |

> 定位球两项跟位置无关 —— 决定因素是"谁是主罚手",不是球员踢哪个位置。

---

## GK 门将:9 项技能

4 维度分组(8 项跟 outfield 重叠,3 项 GK 专属):

### physical — 身体

| 技能 | 场上行为 | GK 重要性 |
|---|---|---|
| **pace**(速度) | (无明显场上影响) | 几乎不影响 |
| **strength**(力量) | (无明显场上影响) | 几乎不影响 |

### technical — GK 专属(替换 outfield 的 4 项)

| 技能 | 场上行为 | GK 重要性 |
|---|---|---|
| **reflexes**(反应) | 扑救反应,近距离射门扑不扑得到 | **极重要**(头牌) |
| **handling**(接球) | 接稳球,高空球摘取不脱手 | **极重要**(头牌) |
| **aerial**(高空) | 高空球摘取(出击 / 门内) | 重要 |

### mental — 心理

| 技能 | 场上行为 | GK 重要性 |
|---|---|---|
| **positioning**(站位) | 站位、封角度、站对位置扑救难度降低 | 重要 |
| **composure**(冷静) | 冷静不脱手、关键扑救镇定 | 次要 |

### setPieces — 定位球

| 技能 | GK 重要性 |
|---|---|
| **freeKicks** | 跟位置无关 |
| **penalties** | 跟位置无关 |

> GK 的 `pace` 和 `strength` 在雷达图上会有数值,但**实际算分时不参与 GK 评分**。一个 pace 18 的 GK 跟 pace 10 的 GK,场上表现没差。找 GK **只看 reflexes / handling / aerial / positioning / composure 这 5 项**。

---

## 技能怎么涨 / 怎么掉

| 来源 | 怎么影响 | 详细章节 |
|---|---|---|
| **比赛** | 比赛后引擎按场上表现给技能 +1(潜力内) | [第 6 章:比赛:基本信息](06-match-basics.md) |
| **训练** | 周四按你定的训练类别涨,5 选 1 | [第 7 章:训练](07-training.md) |
| **衰退** | 35+ 岁的老将,周一可能被削一点(后台跑) | [第 4 章:球员:其他属性](04-player-attributes.md) |
| **青训 reveal** | youth 球员每周围棋式揭示 1 项技能 | [第 19 章:青年球员](19-youth.md) |
| **转会** | 买的球员 currentSkills 固定(对方青年队 / 球探挑的) | [第 18 章:转会交易](18-transfer.md) |

**封顶**:涨到 `potentialSkills` 就到顶(虚线位置)。senior 球员潜力已定型,youth 球员涨到顶后停。

**自然降**只有两种:
- **35+ 岁老将** 的衰退系统(周一后台跑)
- **严重伤病** 期间的表现可能拉低,但技能数值本身不直接降
- 训练**不会降**技能

---

## 跟其他概念的关系

| 概念 | 关系 |
|---|---|
| **position**(第 3 章) | 决定哪些技能被引擎"加权"用 → 见 [球员:位置](03-positions.md) |
| **21 档 tier 标签**(附录 3) | 每项技能 0-20 → 标签,雷达图上显示 → 见 [A3-tier-labels](A3-tier-labels.md) |
| **PWI / overall**(第 4 章) | 头牌技能 + 潜力 + form 综合算的**综合分**,不是技能简单加和 |
| **form**(第 4 章) | 短期状态,跟技能正交(form 高技能不一定高) |
| **experience / 等级**(第 4 章) | 长期"老练度",跟技能正交(老将不一定技能高) |
| **potentialSkills**(第 4 章) | 技能的天花板 |
| **specialties**(第 4 章) | 事件触发加成的特性标签,跟具体技能无关 |

---

## 常见错误(关于技能本身)

❌ **"均衡雷达 = 强"**:均衡只说明分布均匀,不是 PWI 高。真正强不强看 PWI
❌ **追求每项都高**:技能有上限 + 工资约束,真实球员有强项有弱项,**强项对位置就够用**
❌ **把 GK 雷达图的 pace / strength 当回事**:**没用**,GK 算分不走这俩
❌ **忽视 4 维度的分组**:21 档标签不分组(L0-L20 都用),但**技能类型不同** — pace 20 体能 ≠ reflexes 20 扑救反应

> 关于**跨位置比技能 / 头牌选错** 这类"位置相关"的错误,见 [第 3 章:球员:位置](03-positions.md) 的"常见错误"。

---

## 接下来

- [第 3 章:球员:位置](03-positions.md) — 14 个位置 + 头牌技能(定性,不带具体值)
- [第 4 章:球员:其他属性](04-player-attributes.md) — PWI / form / EXP / 伤病 / specialty
- [第 5 章:阵容:基本认识](05-lineup-basics.md) — 怎么把球员放对位置
- [附录 3:球员等级标签](A3-tier-labels.md) — 21 档 tier 标签完整表

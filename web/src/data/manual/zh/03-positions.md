---
order: 3
slug: positions
title: 球员:位置
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 4, 5, 15]
relatedEntries: [position-keys-glossary, w-vs-wm, wbl-vs-lb, am-vs-cm, dm-vs-cdm, cfl-cfr-vs-cf, cd-cdl-cdr-vs-cb, skill-priority-w, skill-priority-cb, skill-priority-cm-dm-am, skill-priority-cf, skill-priority-gk]
---

# 球员:位置

每个球员在场上都有一个**位置**。位置决定:
- 这个球员在**场上哪个区域活动**
- **哪些技能被加权**(头牌 vs 几乎不看的技能)
- 阵容的**板凳 / 换人 / 战术**逻辑

GoalXI 总共 **9 个位置家族 + 14 个具体位置键**。同一家族内的球员可以互相替补,不同家族基本不能直接换(头牌完全不同)。

> 位置相关的**位置键字典**(CD / CBL / CB / WBL / LM / WML / AM 等所有 14 个具体键)见 FAQ 的 `position-keys-glossary` 条目;**位置 vs 头牌技能详细对比** 见 `w-vs-wm` / `wbl-vs-lb` / `am-vs-cm` / `dm-vs-cdm` / `cfl-cfr-vs-cf` 等条目。

---

## 9 大位置家族速览

| 家族 | 位置键(中/英) | 场上区域 | 头牌技能(定性) |
|---|---|---|---|
| **GK** | GK | 球门前 | reflexes / handling / positioning |
| **CB**(中后卫) | CB / CBL / CBR(3-slot) | 禁区前 | defending / positioning / strength |
| **fullback**(边后卫) | LB / RB(传统) / WBL / WBR(翼卫) | 边路 | defending / positioning |
| **W**(边锋) | LW / RW | 边路最前 | pace / dribbling / finishing |
| **WM**(边中场) | LM / RM(实际 WML / WMR) | 边路中场 | pace / dribbling / passing / positioning |
| **CM**(中前卫) | CM / CML / CMR(3-slot) | 中路 | passing / defending / dribbling |
| **DM**(防守中场) | DM / DML / DMR(3-slot) | 中路后 | defending / positioning / strength |
| **AM**(前腰) | AM / AML / AMR(3-slot) | 中路前 | passing / dribbling / finishing |
| **CF**(中锋) | CF / CFL / CFR(3-slot) | 禁区前 | finishing / positioning / strength |

> **3-slot** 家族(CB / CM / DM / AM / CF)可以填 1-3 个球员在家族内,3 个槽位用同一组头牌技能。

---

## 3-slot vs 1-slot 家族

**3-slot 家族**(5 个):同一家族有 3 个 slot,3 个球员的技能权重相同:
- **CB**:CBL(左) / CB(中) / CBR(右) — 3 个中后卫站位不同
- **CM**:CML(左) / CM(中) / CMR(右)
- **DM**:DML / DM / DMR
- **AM**:AML / AM / AMR
- **CF**:CFL / CF / CFR

**1-slot 家族**(4 个):每个就一个具体位置:
- **GK**:只有 GK
- **W**:LW / RW(2 个,但不算 1 个家族,2 个独立 slot)
- **WM**:LM / RM(2 个,实际 WML / WMR)
- **fullback**:LB / RB(传统) + WBL / WBR(翼卫) — 4 个 slot,**不是一个家族**

**填法**:
- 3-slot 家族可以填 1-3 个(3-4-3 的 CB 经常只填 2 个)
- 1-slot 家族 / 边锋 / 边中场 每个 slot 独立填(0 / 1)

---

## 各位置详解

### GK — 门将

- **职责**:守门。扑救、单刀、低平球、高空球
- **头牌**:`reflexes（反应）` / `handling（接球）` / `positioning（跑位）`
- **重要**:`aerial（高空）` / `composure（冷静）`
- **几乎不看**:`pace（速度）` / `strength（力量）` / 定位球(不影响 GK 评分)
- **常见用法**:**每个球队必须有 1 个**;4-3-3 / 4-4-2 / 3-5-2 都用 1 GK
- **找 GK 重点**:**只买高 `reflexes（反应）` / `handling（接球）`**,其他都是锦上添花

### CB — 中后卫(CBL / CB / CBR)

- **职责**:禁区前防守。盯对方中锋、卡位、抢断、头球解围、出球
- **头牌**:`defending（防守）` / `positioning（跑位）` / `strength（力量）`
- **重要**:`passing（传球）`(现代 CB 要能拿球出球)
- **几乎不看**:`dribbling（盘带）` / `finishing（射门）` / 定位球
- **3-slot**:左 / 中 / 右 3 个 slot,可填 1-3 个
- **常见用法**:
  - 4 后卫 = 2 个 CB(传统双中卫)
  - 3 后卫 = 3 个 CB(全填)
  - 5 后卫 = 3 个 CB

### fullback — 边后卫(LB / RB / WBL / WBR)

- **职责**:边路防守 + 有限插上。盯对方边锋、协防、传中
- **头牌**:`defending（防守）` / `positioning（跑位）`
- **重要**:`pace（速度）`(回追)/ `strength（力量）`(对抗)
- **几乎不看**:`finishing（射门）` / 定位球
- **分两类**:
  - **传统边后卫 LB / RB** — 位置靠后,插上有限 → 4 后卫阵型
  - **翼卫 WBL / WBR** — 大幅插上,基本等于"半个 W" → 3 中卫 / 352 / 3412 阵型
- **找 WBL 的标准**:基本算"半个 W"的身体素质(`pace（速度）` + `dribbling（盘带）` + `finishing（射门）` 都要够),不然回防时站不住
- **WBL 上去后空档大**:必须有 CB 帮擦屁股,**或者中卫出球能力要够**

### W — 边锋(LW / RW)

- **职责**:边路最前。突破、传中、内切打门
- **头牌**:`pace（速度）` / `dribbling（盘带）` / `finishing（射门）`
- **重要**:`passing（传球）`(传中质量)
- **几乎不看**:`defending（防守）` / `positioning（跑位）` / `composure（冷静）`(W 几乎不参与防守)
- **2 个独立 slot**:LW / RW 各占一边
- **常见用法**:
  - 4-3-3 / 4-2-3-1 / 3-4-3:2 个 W
  - 反击流特别需要 W 的速度(纯爆点)

### WM — 边中场(LM / RM)

- **职责**:边路中场。中场组织、协助防守、给边锋输送
- **头牌**:`pace（速度）` / `dribbling（盘带）` / `passing（传球）` / `positioning（跑位）`(4 项都重要)
- **几乎不看**:`finishing（射门）`
- **2 个独立 slot**:LM / RM 各占一边
- **vs W**:**WM 要回追,W 不回**。WM 是"半攻半守"位置
- **常见用法**:
  - 4-4-2 中场线 2 个 WM
  - 4-1-4-1 偏防守时用 WM
  - 控球流用 WM 拉边组织

### CM — 中前卫(CML / CM / CMR)

- **职责**:中路平衡。出球 + 协防 + 推进
- **头牌**:`passing（传球）` / `defending（防守）` / `dribbling（盘带）`(3 项平衡)
- **重要**:`positioning（跑位）` / `composure（冷静）`
- **几乎不看**:`finishing（射门）`(偶尔插上,不是头牌)
- **3-slot**:左 / 中 / 右
- **vs DM / AM**:CM 兼顾攻守,DM 偏守,AM 偏攻
- **常见用法**:
  - 4-3-3 中场线 = 3 个 CM(常见 2 CM + 1 DM 配置)
  - 4-2-3-1 双后腰 = 2 CM(都偏守)

### DM — 防守中场(DML / DM / DMR)

- **职责**:中后卫前面第一道屏障。拦截、抢断、保护后防线
- **头牌**:`defending（防守）` / `positioning（跑位）` / `strength（力量）`
- **重要**:`passing（传球）`(出球发起)
- **几乎不看**:`finishing（射门）` / `dribbling（盘带）`(DM 几乎不参与进攻)
- **3-slot**:左 / 中 / 右
- **"单后腰"特殊**:单后腰 = 球队只有 1 个 DM 时,**对 DM 的要求最高**(出球 + 防守 + 站位都要强)
- **常见用法**:
  - 4-2-3-1 双后腰 = 2 DM
  - 4-1-4-1 = 1 DM + 4 CM
  - **AM 前面必须有 DM**:AM 几乎不防守,DM 在后面擦屁股

### AM — 前腰(AML / AM / AMR)

- **职责**:中场最前。直塞、最后一传、制造机会、前插射门
- **头牌**:`passing（传球）` / `dribbling（盘带）` / `finishing（射门）`
- **几乎不看**:`defending（防守）` / `strength（力量）`(AM 几乎不参与防守)
- **3-slot**:左 / 中 / 右
- **"单前腰"特殊**:**必须有 DM 在后面**,AM 防守 ≈ 0
- **常见用法**:
  - 4-2-3-1 单前腰:AM + 2 DM
  - 4-1-2-1-2 diamond:1 DM + 2 CM + 1 AM
  - 3-4-1-2:1 DM + 1 AM + 2 CM

### CF — 中锋(CFL / CF / CFR)

- **职责**:禁区前。进球、抢点、扛中后卫、做支点
- **头牌**:`finishing（射门）` / `positioning（跑位）` / `strength（力量）`
- **重要**:`composure（冷静）`(单刀)
- **几乎不看**:`defending（防守）` / `passing（传球）`(CF 出球弱,组织交给 AM)
- **3-slot**:左 / 中 / 右
- **CFL / CFR 是 3-striker(3-4-3)用**,不是给单中锋阵型
- **常见用法**:
  - 4-3-3 / 4-4-2 双前锋 = 1 CF(单箭头)
  - 4-4-2 双前锋 = 2 CF(不分左右)
  - 3-4-3 = CFL + CF + CFR 三前锋
  - 找 CF 重点:**finishing 是硬门槛**,其他都是锦上添花

---

## 头牌技能速查表

> 这是**定性参考**,具体每个位置的技能重要性看 FAQ `skill-priority-*` 各位置条目。

| 位置 | 头牌 2-3 项 | 重要(次) | 几乎不看 2-3 项 |
|---|---|---|---|
| **GK** | reflexes / handling / positioning | aerial / composure | pace / strength / 定位球 |
| **CB** | defending / positioning / strength | passing | dribbling / finishing / 定位球 |
| **fullback** | defending / positioning | pace / strength | finishing / 定位球 |
| **W** | pace / dribbling / finishing | passing | defending / positioning / composure |
| **WM** | pace / dribbling / passing | positioning / composure | finishing / strength |
| **CM** | passing / defending / dribbling | positioning / composure | finishing / strength |
| **DM** | defending / positioning / strength | passing | finishing / dribbling / 定位球 |
| **AM** | passing / dribbling / finishing | pace | defending / strength |
| **CF** | finishing / positioning / strength | composure / pace | defending / passing / 定位球 |

> **如何读这个表**:`W` 行 = `pace / dribbling / finishing` 是头牌(W 这 3 项高 = 强 W);`defending / positioning / composure` 是几乎不看(W 防守 = 0)。

---

## 跨位置比较(简表)

GoalXI 里**最容易混淆**的几对位置:

| 对比 | 关键差异 |
|---|---|
| **W vs WM** | W 几乎不防守(纯进攻),WM 要回追(半攻半守) |
| **WBL vs LB** | WBL 大幅插上(半个 W),LB 位置靠后(传统) |
| **AM vs CM** | AM 几乎不防守,CM 平衡;AM = "半个 W" 偏攻 |
| **DM vs CM** | DM = 纯守,CM = 平衡;DM 进攻 ≈ 0 |
| **CFL/CFR vs CF** | CFL/CFR 是 3-striker 阵型(3-4-3),不是给单箭头 |

详细对比见 FAQ 的 `w-vs-wm` / `wbl-vs-lb` / `am-vs-cm` / `dm-vs-cdm` / `cfl-cfr-vs-cf`。

---

## 常见错误(位置)

❌ **跨位置比 PWI / 技能**:`W` 的 PWI 18 跟 `CB` 的 PWI 18 **意义不同** —— 位置权重不同,场上实际表现天差地别
❌ **头牌选错位置**:把"全能均衡"球员放错位置 → 头牌技能用不上,场上隐身
❌ **AM 不配 DM**:单前腰阵型**必须有 DM 在后面**,AM 防守 ≈ 0,没 DM 就被打穿
❌ **WBL 当 LB 用**:WBL 是翼卫,3 中卫阵型用;4 后卫阵型用 LB。混用 = WBL 上去不回防 = 灾难
❌ **GK 看 pace / strength**:**没用**,pace / strength 对 GK 表现没影响。pace 18 的 GK 跟 pace 10 的 GK 一样
❌ **CF 当出球点**:CF 的出球弱(`passing（传球）` 几乎不看),需要 AM 串联,别让 CF 拿球就传
❌ **3-slot 家族只填 1 个**:**可以**填 1 个(常见 4 后卫阵型),但要意识到这一侧没补位

---

## 跟其他概念的关系

| 概念 | 关系 |
|---|---|
| **技能**(第 2 章) | 头牌技能是位置的"判定标准"—— 头牌高 = 适合这个位置 |
| **PWI**(第 4 章) | 头牌技能 + 潜力 + form 综合算的**综合分**,PWI 高 ≠ 适合任意位置 |
| **BenchConfig / 换人**(第 5 章) | 阵容怎么排、怎么换 —— 位置 + 板凳 |
| **战术**(第 15 章) | tempo / pitchWidth / defensiveLine 影响球员在位置上的实际表现 |
| **阵型** | 位置 + 数量 = 阵型(4-3-3 / 4-4-2 等) |

---

## 接下来

- [第 2 章:球员:技能](02-player-skills.md) — 每项技能的含义
- [第 4 章:球员:其他属性](04-player-attributes.md) — PWI / form / EXP / 伤病
- [第 5 章:阵容:基本认识](05-lineup-basics.md) — 怎么把球员放对位置 + 板凳
- [第 15 章:比赛:战术](15-tactics.md) — 战术怎么调度位置
- [附录 3:球员等级标签](A3-tier-labels.md) — 雷达图上的 tier 标签

# GoalXI 比赛引擎技术规范 (Match Engine Specification)

本文档详细描述了 GoalXI 比赛模拟引擎的核心逻辑、数学模型以及单场比赛的处理流程。

---

## 1. 核心架构概述

比赛引擎采用 **基于关键时刻 (Moment-based)** 的离散时间模拟算法。一场 90 分钟的比赛被划分为若干个关键时间点，在每个点上计算球员状态、处理战术调整并触发比赛事件。

### 核心组件

- **MatchEngine**: 指挥中心，负责模拟主循环、事件分发和计分。
- **Team**: 管理球队阵容、实时快照 (Snapshot) 和体力状态。
- **ConditionSystem**: 负责计算状态倍率 (Multiplier)，包括体力衰减、士气和经验影响。
- **AttributeCalculator**: 负责将球员原始属性转化为特定位置和球道 (Lane) 的贡献值。

---

## 2. 比赛准备阶段 (Initialization)

在模拟开始前，引擎会加载以下数据：

1. **球队阵容**: 主客场各 11 名首发球员及其位置。
2. **战术指令 (Tactical Instructions)**: 预设的换人 (Substitution) 或位置移动 (Position Move) 计划。
3. **替补名单**: 供换人使用的完整球员数据映射表。
4. **初始快照**: 计算两队开场时的绝对实力评分。

---

## 3. 模拟循环 (Simulation Loop)

引擎将 90 分钟划分为 **20 个关键时刻**。每个时刻的处理流程如下：

### A. 时间步进 (Temporal Progression)

- 计算当前时刻相对于上一个时刻的时间差 (Delta)。
- 检查是否存在 **中场休息 (Half-time)**，如果存在则触发恢复逻辑。

### B. 战术指令处理 (Tactical Processing)

- 引擎会遍历 Delta 期间的 **每一分钟**。
- 检查该分钟是否有符合条件的战术指令（如：第 60 分钟换人，或者落后时改变位置）。
- **换人逻辑**: 移除下场球员，加入新球员并初始化其体力。
- **立即更新**: 任何战术变化都会立即触发现场阵容的实力快照更新。

### C. 状态更新 (Condition Update)

- **体力衰减 (Decay)**: 根据时间流逝计算球员体力消耗。
- **表现倍率计算**:
  - **Form (士气)**: 使用 Sigmoid 函数计算（0.78 - 1.12）。
  - **Experience (经验)**: 提供最高 +21% 的能力加成。
  - **Stamina Tank (体力池)**: 拥有 25% 的保护缓冲层，只有当体力跌破缓冲层后，衰减才会线性影响表现。

### D. 关键时刻模拟 (Key Moment Simulation)

1. **球道选择**: 随机选择左路、中路或右路作为本次进攻的主战场。
2. **犯规检查**: 8% 的概率发生犯规。
   - 10% 概率红卡（球员离场，系统重新计算差一人时的球队评分）。
   - 30% 概率黄卡，其余为普通犯规。
3. **球权争夺 (Possession Duel)**: 比较两队在该球道的控球评分 (Possession Rating)，通过 S 型概率函数决定进攻方。
4. **威胁评估 (Threat Calculation)**: 比较进攻方的进攻强度 (Attack) 与防守方的防御强度 (Defense)。
5. **射门结算 (Finish Resolution)**:
   - 如果进攻成功，选择一名射手（前锋权重更高）。
   - 考虑射程因子和防守干扰。
   - **射门评分 vs 守门员评分**: 决定是否进球。

---

## 4. 实时快照系统 (Snapshot System)

为了提高模拟效率，引擎每 5 分钟（或在发生战术变化时）更新一次球队快照。

- **Snapshot 包含**: 各个球道（左/中/右）的进攻、防御、控球累计值，以及守门员的最终扑救评分。
- 这个快照会自动锁定受体力、波动和经验叠加影响后的 **真实实时能力**。

---

## 5. 比赛结束与持久化

### 终场结算 (Full-time)

- 补时逻辑：在 90 分钟基础上随机增加 1-4 分钟。
- 生成 `full_time` 事件并记录最终比分。

### 数据流向

1. **MatchEvents**: 所有的进球、换人、红黄牌、快照数据被封装为数组返回。
2. **Persistence**:
   - 每一个事件被存入 `match_event` 表。
   - 统计数据（射门、控球、犯规等）被汇总至 `match_team_stats` 表。
   - **MatchCompletionService**: 负责更新球员的生涯统计（出场次数、进球数、红黄牌），并处理联赛积分榜。

---

## 6. 数学模型参考

### 表现倍率公式 (Condition Formula)

$$Multiplier = Sigmoid(Form) \times ExperienceBonus \times StaminaFactor$$

- **StaminaFactor**: 当 $CurrentFit < (StartStamina \times 0.75)$ 时开始衰减。
- **ExperienceBonus**: $1 + \frac{0.21 \times Exp}{Exp + 6}$

---

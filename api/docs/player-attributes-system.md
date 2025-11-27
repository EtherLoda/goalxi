# 球员属性系统设计文档

## 一、设计理念

### 三维分类法
所有属性归纳为三大类：
- **身体 (Physical)** - 能跑多快、能抗多久
- **技术 (Technical)** - 球处理得好不好  
- **意识 (Mental)** - AI 聪不聪明（经理游戏的核心）

### 数值系统
- **存储**: 0.00-20.00（2位小数精度）
- **显示**: 0-20（整数，玩家看到的）
- **优势**: 玩家不知道准确数值，增加神秘感和探索乐趣

## 二、属性详解

### 普通球员（11个属性）

#### 身体属性 (Physical) - 3个
1. **速度 (Pace)**: 冲刺速度和爆发力，决定反越位和回追能力
2. **强壮 (Strength)**: 身体对抗，决定卡位、争顶和拼抢胜率
3. **体能 (Stamina)**: 决定属性下降幅度和受伤概率

#### 技术属性 (Technical) - 4个
4. **射术 (Finishing)**: 禁区内外射门精度
5. **传球 (Passing)**: 短传、长传和传中综合能力
6. **盘带 (Dribbling)**: 控球不丢和过人成功率
7. **防守 (Defending)**: 抢断和盯人综合能力

#### 意识属性 (Mental) - 5个
8. **视野 (Vision)**: 进攻AI，发现空档传致命球
9. **跑位 (Positioning)**: 进攻AI，无球跑动到关键位置
10. **防守站位 (Awareness)**: 防守AI，补位和拦截传球线路
11. **决断 (Composure)**: 关键时刻稳定性，影响单刀球和点球
12. **侵略性 (Aggression)**: 拼抢积极性和犯规概率（双刃剑）

### 门将（10个属性）

#### 身体属性 (Physical) - 3个
1. **速度 (Pace)**: 出击速度
2. **强壮 (Strength)**: 身体对抗
3. **体能 (Stamina)**: 持久力

#### 技术属性 (Technical) - 3个（门将专属）
4. **反应 (Reflexes)**: 扑救近距离射门和神仙球
5. **手控 (Handling)**: 是否脱手和控制高空球
6. **出球 (Distribution)**: 门球和手抛球成功率

#### 意识属性 (Mental) - 4个
7. **视野 (Vision)**: 观察场上局势
8. **站位 (Positioning)**: 门将站位选择
9. **意识 (Awareness)**: 预判和决策
10. **决断 (Composure)**: 关键时刻稳定性

## 三、数据库存储方案

### 使用 JSONB 的优势

#### ✅ 灵活性
- 普通球员和门将使用不同的属性结构
- 无需为每个属性创建单独的列
- 易于扩展新属性

#### ✅ 精确性
- 存储2位小数（如 15.50）
- 支持精确计算和比较
- 前端可以四舍五入显示

#### ✅ 查询能力
PostgreSQL JSONB 支持：
```sql
-- 查询速度大于15的球员
SELECT * FROM player 
WHERE (attributes->'physical'->>'pace')::numeric > 15;

-- 查询传球能力最强的10名球员
SELECT * FROM player 
WHERE is_goalkeeper = false
ORDER BY (attributes->'technical'->>'passing')::numeric DESC 
LIMIT 10;

-- 创建索引加速查询
CREATE INDEX idx_player_pace 
ON player ((attributes->'physical'->>'pace'));
```

#### ✅ 类型安全
```typescript
// TypeScript 类型定义
interface OutfieldPlayerAttributes {
  physical: {
    pace: number;      // 0-20
    strength: number;  // 0-20
    stamina: number;   // 0-20
  };
  technical: {
    finishing: number;  // 0-20
    passing: number;    // 0-20
    dribbling: number;  // 0-20
    defending: number;  // 0-20
  };
  mental: {
    vision: number;      // 0-20
    positioning: number; // 0-20
    awareness: number;   // 0-20
    composure: number;   // 0-20
    aggression: number;  // 0-20
  };
}

interface GoalkeeperAttributes {
  physical: {
    pace: number;
    strength: number;
    stamina: number;
  };
  technical: {
    reflexes: number;
    handling: number;
    distribution: number;
  };
  mental: {
    vision: number;
    positioning: number;
    awareness: number;
    composure: number;
    aggression: number;
  };
}
```

## 四、OVR 计算示例

### 位置加权系统
不同位置对属性的权重不同：

```typescript
// 前锋 (FWD) OVR 计算
const fwdWeights = {
  physical: { pace: 0.15, strength: 0.10, stamina: 0.05 },
  technical: { finishing: 0.20, passing: 0.10, dribbling: 0.15, defending: 0.02 },
  mental: { vision: 0.08, positioning: 0.12, awareness: 0.03, composure: 0.08, aggression: 0.05 }
};

// 中场 (MID) OVR 计算
const midWeights = {
  physical: { pace: 0.10, strength: 0.08, stamina: 0.12 },
  technical: { finishing: 0.08, passing: 0.18, dribbling: 0.12, defending: 0.10 },
  mental: { vision: 0.15, positioning: 0.10, awareness: 0.12, composure: 0.08, aggression: 0.05 }
};

// 后卫 (DEF) OVR 计算
const defWeights = {
  physical: { pace: 0.12, strength: 0.15, stamina: 0.08 },
  technical: { finishing: 0.02, passing: 0.10, dribbling: 0.05, defending: 0.20 },
  mental: { vision: 0.05, positioning: 0.08, awareness: 0.18, composure: 0.10, aggression: 0.08 }
};
```

## 五、实现建议

### 1. 验证规则
```typescript
// 属性值必须在 0-20 之间
const validateAttribute = (value: number): boolean => {
  return value >= 0 && value <= 20;
};

// 验证所有属性
const validatePlayerAttributes = (attrs: PlayerAttributes): boolean => {
  // 验证每个属性值...
};
```

### 2. 随机生成
```typescript
// 生成随机属性（8-18之间，符合正态分布）
const generateRandomAttribute = (): number => {
  const mean = 13;
  const stdDev = 2.5;
  const value = normalDistribution(mean, stdDev);
  return Math.max(8, Math.min(18, Math.round(value * 100) / 100));
};
```

### 3. UI 显示
```typescript
// 前端显示时四舍五入
const displayAttribute = (value: number): number => {
  return Math.round(value);
};

// 15.50 → 显示为 16
// 15.49 → 显示为 15
```

## 六、优势总结

✅ **深度**: 12个属性足以区分不同类型球员  
✅ **简洁**: 比FIFA/FM少，但保留核心战术深度  
✅ **灵活**: JSONB存储，易于扩展  
✅ **神秘**: 玩家看不到精确值，增加探索乐趣  
✅ **智能**: 位置加权系统，同一球员不同位置OVR不同  
✅ **性能**: PostgreSQL JSONB 查询性能优秀  

---

**设计日期**: 2025-11-27  
**版本**: 1.0

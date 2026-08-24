# RFC 0002: MatchEvent Two-Axis Coding — `(event_class × outcome)` 设计

- **Status**: Draft v0.1 (2026-08-24)
- **Author**: Mavis (session `mvs_5fae18288747438a814aea6d71907e60`)
- **Target**: 3 PRs (Phase 1 / Phase 2 / Phase 3), 3 weeks total
- **Depends on**: 无
- **Decisions locked**:
  - D1 = A (3 PRs, 留一周观察)
  - D2 = 合并 (FOUL outcome 包含 card 4 档，CARD class 取消)
  - D3 = A (stable int，跨环境 id 一致)
  - D4 = 不要中间表 (class_def.outcomes SMALLINT[] 存允许列表)
  - D5 = A (i18n 塞 description JSONB)

---

## 1. 背景

`libs/database/src/constants/event-types.ts` 现有 `MatchEventType` 是 **35 项** int enum，其中 2 项 (`SECOND_YELLOW=101`, `DIRECT_FREE_KICK=181`) 是**子编码 hack** —— 试图用"在主 ID 后面拼小数字"来表达"event_type 内嵌的 outcome"，但这是个**坏形状**：

- 一个 event 可能有 N 个 outcome 同时成立 (shooter + assist + GK 对一个 goal 都成立)
- 扁平 enum 难加新 outcome
- 走索引查"X 球员射了几次门"得 `WHERE data->>'outcome'='goal'` 扫 JSONB

引擎侧 (`simulator/src/processor/simulation.processor.ts:1505`) 的 `mapEventType(string) → int` 是**反向查表** —— simulator 用的真相源是 `typeName` 字符串 (lower_snake)，不是 int。FE 端读 `typeName` 跟硬编码数组匹配 (`web/src/components/match/extract-key-events.ts:26-35`)。

RFC 0003 (specialty attribution) 落地时已经在 4 个地方 (`match-event.entity.ts:80-96`) 抽了部分 outcome 成 generated column (`shotType / bodyPart / cardType / injurySeverity / subPosition / penaltyOutcome`)，但**抽得不完整** —— `shotOutcome / foulOutcome / cornerOutcome / freeKickOutcome` 这 4 个还在 jsonb 里。

## 2. 目标

把每个 (event_class, outcome) 组合存成**两个独立列** + **字典表**：

- `event_class_id` (SMALLINT, nullable for legacy) — 高层 family
- `outcome_id` (SMALLINT, nullable) — 那个 family 内的结局
- `outcome_code` (VARCHAR) — 稳定 string，给 FE 用，不依赖 join

D2 = 合并 FOUL 与 CARD 后，class 数从 ~20 砍到 **17**，outcome 数 **28**，笛卡尔积稀疏但**不再有 hack**。

## 3. 非目标

- 不改 engine emit 路径（**Phase 1 不动**）
- 不 drop `type` int + `typeName` 字符串列（**Phase 3 才 drop**）
- 不改 6 个已抽 generated column（保留兼容 FE 旧读）
- 不做新的 event 类型（如 xG / possession_chain —— 推 P2）
- 不做事件级聚合视图（stats 服务在 settlement 端做，不在 match_event 表上）
- 不做 FE live feed 协议改造（payload shape 只增不改 1 个版本）

## 4. 设计

### 4.1 字典表（PG 实体表，不用 enum）

```sql
-- event_class: 17 项 (1-20 区间，留 3 个 slot 给未来扩展)
CREATE TABLE event_class_def (
    id          SMALLINT PRIMARY KEY,
    code        VARCHAR(32) UNIQUE NOT NULL,  -- 'SHOT' 'FOUL' 'CARD' ...
    family      VARCHAR(16) NOT NULL,          -- 'positive' / 'negative' / 'neutral' / 'period'
    outcomes    SMALLINT[] NOT NULL DEFAULT '{}',  -- 允许的 outcome id 列表（D4）
    is_visible  BOOLEAN NOT NULL DEFAULT TRUE,    -- SK/MATCH_START 这类元事件隐藏
    sort_order  SMALLINT NOT NULL,
    description JSONB NOT NULL                    -- {"zh":"射门","en":"Shot"}
);

-- event_outcome: 28 项 (1-30 区间)
CREATE TABLE event_outcome_def (
    id            SMALLINT PRIMARY KEY,
    code          VARCHAR(32) UNIQUE NOT NULL,  -- 'GOAL' 'SAVE' ...
    is_positive   BOOLEAN NOT NULL,             -- "对我方有利" 过滤
    is_countable  BOOLEAN NOT NULL,             -- 是否进 stats (save 进，neutral_event 不进)
    sort_order    SMALLINT NOT NULL,
    description   JSONB NOT NULL                -- {"zh":"进球","en":"Goal"}
);
```

> 为什么实体表不用 PG enum：
> - enum 改值要 ALTER TYPE，rollback 难
> - i18n 描述可以 join 拉，不用走代码常量
> - SMALLINT 2 bytes，比 enum 字符串列省空间

### 4.2 class × outcome 矩阵

#### Classes (17)

| id | code | family | outcomes (id 列表) | 替换的旧 type |
|---|---|---|---|---|
| 1 | KICKOFF | neutral | [] | KICKOFF=1 |
| 2 | PERIOD | period | [26,27] | HALF_TIME/FULL_TIME/SECOND_HALF_START/EXTRA_TIME_START/PENALTY_START |
| 3 | SHOT | positive | [1,2,3,4] | GOAL/SHOT_ON_TARGET/SHOT_OFF_TARGET/SAVE (合并) |
| 4 | FOUL | negative | [5,6,7,8,9] | FOUL/YELLOW_CARD/SECOND_YELLOW/RED_CARD/**D2 合并** |
| 5 | FREE_KICK | neutral | [10,11,12] | FREE_KICK/**DIRECT_FREE_KICK=181 hack** |
| 6 | CORNER | neutral | [10,11] | CORNER |
| 7 | PENALTY | positive | [1,4,13] | PENALTY/PENALTY_MISS (扩展加 saved) |
| 8 | SUBSTITUTION | neutral | [14,15,16] | SUBSTITUTION (tacticalReason 抽出) |
| 9 | INJURY | negative | [17,18] | INJURY (severity 已部分抽) |
| 10 | VAR | neutral | [19,20,21,22,23] | VAR_DECISION |
| 11 | OWN_GOAL | positive | [] | OWN_GOAL |
| 12 | CELEBRATION | positive | [] | CELEBRATION |
| 13 | LINEUP | neutral | [24,25] | PLAYER_INTRODUCTION |
| 14 | WEATHER | neutral | [] | WEATHER_ANNOUNCEMENT |
| 15 | ATTENDANCE | neutral | [] | ATTENDANCE_ANNOUNCEMENT |
| 16 | MATCH_META | period | [26,28,27] | MATCH_START/FORFEIT |
| 17 | SNAPSHOT | neutral | [] | SNAPSHOT (is_visible=false) |

#### Outcomes (28)

| id | code | is_positive | is_countable |
|---|---|---|---|
| 1 | GOAL | T | T |
| 2 | SAVE | T | T |
| 3 | BLOCKED | F | T |
| 4 | MISS | F | T |
| 5 | WARNING | F | F |
| 6 | YELLOW | F | T |
| 7 | SECOND_YELLOW | F | T |
| 8 | RED | F | T |
| 9 | PENALTY_AWARDED | F | T |
| 10 | AWARDED | F | F |
| 11 | TAKEN | F | T |
| 12 | DIRECT_GOAL | T | T |
| 13 | SAVED | T | T |
| 14 | TACTICAL | T | F |
| 15 | SUB_INJURY | T | F |
| 16 | SUB_TIRED | T | F |
| 17 | INJURY_MILD | F | T |
| 18 | INJURY_SEVERE | F | T |
| 19 | GOAL_AWARDED | T | T |
| 20 | GOAL_DENIED | F | T |
| 21 | PENALTY_DENIED | F | T |
| 22 | RED_CARD | F | T |
| 23 | CANCELLED | F | F |
| 24 | HOME | T | F |
| 25 | AWAY | T | F |
| 26 | START | T | F |
| 27 | END | F | F |
| 28 | FORFEIT | F | T |

> **Note**: 引擎里没 emit 的 PASS / TACKLE / INTERCEPTION / CLEARANCE / OFFSIDE 这 5 个 debug event **不映射到 class**。它们继续用旧 `typeName` 字符串，Phase 1 的 backfill function 对这 5 个 type 留 NULL class_id。Phase 2 改造 engine 时如果发现这 5 个还有意义再加 class，否则永久保留为 legacy。

### 4.3 实体表加列

```sql
-- 核心 3 列
ALTER TABLE match_event
    ADD COLUMN event_class_id SMALLINT NULL,
    ADD COLUMN outcome_id     SMALLINT NULL,
    ADD COLUMN outcome_code   VARCHAR(32) NULL;

-- CHECK 范围（让字典表可换，但不能瞎填）
ALTER TABLE match_event
    ADD CONSTRAINT chk_class CHECK (event_class_id IS NULL OR event_class_id BETWEEN 1 AND 100),
    ADD CONSTRAINT chk_outcome CHECK (outcome_id IS NULL OR outcome_id BETWEEN 1 AND 100);

-- 4 个未抽 outcome generated column（替换 jsonb 那部分）
ALTER TABLE match_event
    ADD COLUMN shot_outcome      VARCHAR(16) GENERATED ALWAYS AS
        (CASE WHEN event_class_id = 3  -- SHOT
              THEN (SELECT code FROM event_outcome_def WHERE id = outcome_id)
              ELSE NULL END) STORED,
    ADD COLUMN foul_outcome      VARCHAR(16) GENERATED ALWAYS AS
        (CASE WHEN event_class_id = 4  -- FOUL
              THEN (SELECT code FROM event_outcome_def WHERE id = outcome_id)
              ELSE NULL END) STORED,
    ADD COLUMN corner_outcome    VARCHAR(16) GENERATED ALWAYS AS
        (CASE WHEN event_class_id = 6  -- CORNER
              THEN (SELECT code FROM event_outcome_def WHERE id = outcome_id)
              ELSE NULL END) STORED,
    ADD COLUMN free_kick_outcome VARCHAR(16) GENERATED ALWAYS AS
        (CASE WHEN event_class_id = 5  -- FREE_KICK
              THEN (SELECT code FROM event_outcome_def WHERE id = outcome_id)
              ELSE NULL END) STORED;

-- 索引
CREATE INDEX idx_event_class_outcome ON match_event (event_class_id, outcome_id)
    WHERE event_class_id IS NOT NULL;
CREATE INDEX idx_player_class_outcome ON match_event (player_id, event_class_id, outcome_id)
    WHERE player_id IS NOT NULL AND event_class_id IS NOT NULL;
```

### 4.4 Backfill function (Phase 1 关键)

```sql
CREATE OR REPLACE FUNCTION match_event_backfill_class_outcome(p_match_id uuid DEFAULT NULL)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE match_event SET
        event_class_id = CASE type
            WHEN 1  THEN 1   -- KICKOFF
            WHEN 2  THEN 3   -- GOAL → SHOT+GOAL
            WHEN 3  THEN 3   -- SHOT_ON_TARGET → SHOT
            WHEN 4  THEN 3   -- SHOT_OFF_TARGET → SHOT
            WHEN 8  THEN 3   -- SAVE → SHOT+SAVE
            WHEN 9  THEN 4   -- FOUL → FOUL+WARNING
            WHEN 10 THEN 4   -- YELLOW_CARD → FOUL+YELLOW
            WHEN 101 THEN 4  -- SECOND_YELLOW → FOUL+SECOND_YELLOW
            WHEN 11 THEN 4   -- RED_CARD → FOUL+RED
            WHEN 12 THEN 8   -- SUBSTITUTION → SUBSTITUTION+TACTICAL
            WHEN 13 THEN 2   -- HALF_TIME → PERIOD+END
            WHEN 14 THEN 2   -- FULL_TIME → PERIOD+END
            WHEN 15 THEN 9   -- INJURY → INJURY (outcome 走 severity 抽)
            WHEN 16 THEN NULL -- OFFSIDE → legacy no class
            WHEN 17 THEN 6   -- CORNER → CORNER+TAKEN
            WHEN 18 THEN 5   -- FREE_KICK → FREE_KICK+TAKEN
            WHEN 181 THEN 5  -- DIRECT_FREE_KICK → FREE_KICK+DIRECT_GOAL
            WHEN 19 THEN 7   -- PENALTY → PENALTY+GOAL
            WHEN 20 THEN 16  -- FORFEIT → MATCH_META+FORFEIT
            WHEN 21 THEN 17  -- SNAPSHOT → SNAPSHOT
            WHEN 22 THEN 16  -- MATCH_START → MATCH_META+START
            WHEN 23 THEN 2   -- SECOND_HALF_START → PERIOD+START
            WHEN 24 THEN 2   -- EXTRA_TIME_START → PERIOD+START
            WHEN 25 THEN 2   -- PENALTY_START → PERIOD+START
            WHEN 26 THEN 12  -- CELEBRATION → CELEBRATION
            WHEN 27 THEN NULL -- NEUTRAL_EVENT → legacy
            WHEN 28 THEN NULL -- CLEARANCE → legacy
            WHEN 29 THEN 11  -- OWN_GOAL → OWN_GOAL
            WHEN 30 THEN 10  -- VAR_DECISION → VAR (outcome 走 data 抽)
            WHEN 31 THEN 7   -- PENALTY_MISS → PENALTY+MISS
            WHEN 32 THEN 14  -- WEATHER_ANNOUNCEMENT → WEATHER
            WHEN 33 THEN 13  -- PLAYER_INTRODUCTION → LINEUP (outcome 走 home/away)
            WHEN 34 THEN 15  -- ATTENDANCE_ANNOUNCEMENT → ATTENDANCE
            ELSE NULL
        END,
        outcome_id = CASE type
            WHEN 2  THEN 1   -- GOAL → GOAL
            WHEN 3  THEN NULL -- SHOT_ON_TARGET outcome ambiguous (was goal OR save)
            WHEN 4  THEN 4   -- SHOT_OFF_TARGET → MISS
            WHEN 8  THEN 2   -- SAVE → SAVE
            WHEN 9  THEN 5   -- FOUL → WARNING
            WHEN 10 THEN 6   -- YELLOW_CARD → YELLOW
            WHEN 101 THEN 7  -- SECOND_YELLOW → SECOND_YELLOW
            WHEN 11 THEN 8   -- RED_CARD → RED
            WHEN 17 THEN 11  -- CORNER → TAKEN
            WHEN 18 THEN 11  -- FREE_KICK → TAKEN
            WHEN 181 THEN 12  -- DIRECT_FREE_KICK → DIRECT_GOAL
            WHEN 19 THEN 1   -- PENALTY → GOAL
            WHEN 20 THEN 28  -- FORFEIT → FORFEIT
            WHEN 22 THEN 26  -- MATCH_START → START
            WHEN 23 THEN 26  -- SECOND_HALF_START → START
            WHEN 24 THEN 26  -- EXTRA_TIME_START → START
            WHEN 25 THEN 26  -- PENALTY_START → START
            WHEN 31 THEN 4   -- PENALTY_MISS → MISS
            ELSE NULL
        END,
        outcome_code = CASE outcome_id
            WHEN 1  THEN 'GOAL'
            WHEN 2  THEN 'SAVE'
            WHEN 3  THEN 'BLOCKED'
            WHEN 4  THEN 'MISS'
            WHEN 5  THEN 'WARNING'
            WHEN 6  THEN 'YELLOW'
            WHEN 7  THEN 'SECOND_YELLOW'
            WHEN 8  THEN 'RED'
            WHEN 11 THEN 'TAKEN'
            WHEN 12 THEN 'DIRECT_GOAL'
            WHEN 26 THEN 'START'
            WHEN 28 THEN 'FORFEIT'
            ELSE NULL
        END
    WHERE (p_match_id IS NULL OR match_id = p_match_id)
      AND event_class_id IS NULL;  -- idempotent
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
```

> **Outcome 0 抽的留 NULL**：SHOT_ON_TARGET、INJURY、SUBSTITUTION、LINEUP、VAR 的 outcome 已经在 jsonb 里（`penaltyOutcome` / `cardType` / `injurySeverity` / `subPosition` / `data.decision`），backfill 只填 class + outcome_id（如果能从 type 直接推），outcome_code 留给 Phase 2 engine 写时填。

## 5. 三阶段实施

### Phase 1：只加列、不破坏读 (1 周)

1. **Migration `1788000000001-CreateEventClassOutcomeDefs.ts`**
   - 建 `event_class_def` + `event_outcome_def` 两表
   - seed 全部数据（17 + 28 行）
   - 给 `match_event` 加 `event_class_id` / `outcome_id` / `outcome_code` 三列（nullable）
   - 加 4 个新 generated column
   - 加新索引
   - 建 `match_event_backfill_class_outcome` function
   - spec 文件 tripwire

2. **暴露 REST**：`GET /match/event-class-def` `GET /match/event-outcome-def` 给 FE 拉

3. **不改 engine、不改任何 reader**

**验收**：
- 所有现存 spec 全过（679 + 393 + 628 = 1700）
- 新列写满但没人读
- DB 一致性 check：所有 `type IN (已知映射)` 的 row 都有 `event_class_id IS NOT NULL`
- 查询 plan 看新索引被使用

### Phase 2：engine 写新列，reader 走 fallback (1.5 周)

1. `simulator/src/processor/simulation.processor.ts`
   - `mapEventType(string) → { classId, outcomeId, outcomeCode } | null` 替换原 `mapEventType`
   - bulk insert 时**同时写 3 个新列**，老 `type` / `typeName` 也写（兼容期）
2. `simulator/src/engine/event.generator.ts`：所有 `generate*` 函数返回的对象加 3 个字段
3. `simulator/src/engine/match.engine.ts`：200+ 处内联 event 创建加 3 个字段
4. reader 改动：
   - `match-event.service.ts:232`（算分）改成 `event_class_id = 3 && outcome_id = 1`  || `event_class_id = 11`
   - `match-completion.service.ts:337-342` 改读新列
   - `match-live.gateway.ts:501-512` 序列化时**新增字段**，老的 `type: typeName` 保留
5. FE 改读**新字段**，保留老 fallback

**验收**：
- 所有 spec 改完并通过
- DB 里新列和老 `typeName` 内容一致（写一个一致性 check 跑 100 场模拟）

### Phase 3：drop 旧列，单一真相 (0.5-1 周)

1. Migration drop `type` int + 6 个旧 generated column
2. Engine 移除 `typeName` 写入路径
3. FE 移除 fallback 分支

**验收**：
- 所有 spec 通过
- DB 体积减少
- 一致性 check 0 差异

## 6. 测试

| 类别 | 文件 | 新增 |
|---|---|---|
| DB | `1788000000001-CreateEventClassOutcomeDefs.spec.ts` | 字典 seed 完整、backfill 100% 覆盖 |
| DB | `1788000000001-CreateEventClassOutcomeDefs.backfill.spec.ts` | 已知 30 个 type 都有映射，5 个 legacy 是 NULL |
| Engine | `simulation.processor.spec.ts`（扩展） | mapEventType 返回新 shape |
| API | `match-event.service.spec.ts`（扩展） | fallback path 走新列 |
| FE | `extract-key-events.spec.ts`（扩展） | 新字段分支 |
| **Tripwire** | `event-types.ts.spec.ts`（新） | 字典表变更时强制 re-seed |
| **Tripwire** | `match-event.entity.spec.ts`（新） | `type` int 列**不存在**（防 Phase 3 后回退） |

## 7. Rollout & Rollback

**Phase 1 任何时候**：`pnpm migration:down` 干净（没 drop 任何列，只删字典表）

**Phase 2 任何时候**：engine rollback 一个 commit 即可，DB 不需要回退（双写）

**Phase 3 不可回退**（drop 列是有损的）—— production drop 之前必须**冷备完整 DB dump**，保留 90 天

## 8. 风险 & 决策点

### 5 个已锁定

1. D1 = 3 PR
2. D2 = FOUL 合并 CARD
3. D3 = stable int
4. D4 = 无中间表
5. D5 = i18n 塞 description JSONB

### 2 个未拍（Phase 1 决定，不阻塞）

- **D11**: PASS / TACKLE / INTERCEPTION / CLEARANCE / OFFSIDE 这 5 个 legacy debug event 要不要也加 class？**建议不加**（保持 scope 小，Phase 2 改造 engine 时再决定）
- **D12**: 4 个 generated column 命名（`shot_outcome` / `foul_outcome` / `corner_outcome` / `free_kick_outcome`）是不是和 RFC 0003 的 `specialtyContributions` 风格一致？**建议一致**（snake_case + 后缀 _outcome）

## 9. 不做的事

- ❌ 1D 短码（`SHOT_GOAL` 这种）—— 字典表 join 出来的 `code` 列已经够用
- ❌ 新 event 类型（xG / xA / possession chain）
- ❌ 事件级聚合视图（stats 服务在 settlement 端做）
- ❌ 改 specialty 系统（那是 RFC 0003 的事，已完成）
- ❌ 改 FE live feed 协议（payload shape 只增不改 1 个版本）

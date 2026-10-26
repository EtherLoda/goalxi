# 解说图标与事件码 — 完整计划

状态：设计稿（未实施）。上游决策见 m23589、m23611。

---

## 0. 目标

1. **一个图标 = 结果层 × 场景层**，不再「一个事件一张图」。
2. **悬停**显示「事件名 + 事件码」，例：`左路抽射进球  SHOT.GOAL`。用户不看解说文字也能确认发生了什么。
3. **统一 24px** 渲染，删除 16/20px 混用。
4. 事件码与 RFC 0002 的 (classId, outcomeId) 对齐，不新造第四套编号。

---

## 1. 现状：三套编号并存

| 层 | 形态 | 例子 | 是否面向玩家 |
|---|---|---|---|
| 引擎 `type` | string | `shot_off_target` | 否 |
| `MatchEventType` | int 1–34 / 101 / 181 | `3` | 否 |
| RFC 0002 | `(classId, outcomeId, outcomeCode)` | `(3, 4, 'MISS')` | **是** |

- `MatchEventType` 含 9 个死值（5 PASS、6 TACKLE、7 INTERCEPTION、16 OFFSIDE、27 NEUTRAL、28 CLEARANCE、29 OWN_GOAL、30 VAR、26 CELEBRATION），引擎从不发出。
- 映射源：`libs/database/src/constants/event-two-axis.ts` → `EVENT_TWO_AXIS[typeName]`、`getEventTwoAxis()`。
- **显示层只允许读 RFC 0002**；`type` int 保留在数据层，UI 不得直接使用。

---

## 2. 事件码规范

格式：`CLASS` 或 `CLASS.OUTCOME`，全大写、点分隔、稳定不变。

```
SHOT.GOAL      SHOT.SAVE      SHOT.MISS
FOUL.YELLOW    FOUL.RED       FOUL.WARNING
PENALTY.GOAL   PENALTY.MISS
CORNER.TAKEN   FREEKICK.TAKEN
TACTICAL.TACTICAL   PERIOD.END   PERIOD.START
KICKOFF        INJURY   WEATHER   ATTENDANCE   INTRO   FORFEIT   SNAPSHOT
```

- 类码取自 classId 1–17（见 `event-two-axis.ts` 注释）。
- 无 outcome 的类只写类名。
- 新增 `web/src/lib/event-code.ts`：

```ts
export const EVENT_CLASS_CODE: Record<number, string> = {
  1: 'KICKOFF', 2: 'PERIOD', 3: 'SHOT', 4: 'FOUL', 5: 'FREEKICK',
  6: 'CORNER', 7: 'PENALTY', 8: 'TACTICAL', 9: 'INJURY',
  13: 'INTRO', 14: 'WEATHER', 15: 'ATTENDANCE', 16: 'FORFEIT', 17: 'SNAPSHOT',
};
export function eventCode(typeName: string): string;  // 'SHOT.GOAL' | 'KICKOFF'
```

单测钉死：每个引擎可发出的 `typeName` 都有非空 code；死值返回 `SHOT`（走 `mapEventType` 的兜底）。

---

## 3. 图标模型：三层

```
L1 主体   进球 = 白球 + 绿环        未进 = 灰球 + 红斜杠
L2 场景   右下角白色小标记：无 / 点球点 / 任意球弧 / 远射准星
L3 通道   不进图标，进标签（左路 / 中路 / 右路）
```

- 结果层只有两态（进球 / 未进）。扑出不再单独成像 —— 按 m23589 的裁定，一律用斜杠。
- 场景标记只有 4 种，全部白色，避免与绿/红争抢。
- 尺寸：viewBox 24、描边 1.6、球心 (10.8, 10) r=6.2、标记盘 (18.4, 18) r=4.7。

---

## 4. 完整事件表

### 4.1 射门（class 3 / 7）

| typeName | 码 | 图标 | 标签（zh） |
|---|---|---|---|
| `goal` | SHOT.GOAL | 白球+绿环 | 左路抽射进球（通道/方式按 data 组合） |
| `shot_on_target` | SHOT | 白球+绿环 | 射门被挡 |
| `save` | SHOT.SAVE | 灰球+斜杠 | 被门将扑出 |
| `shot_off_target` | SHOT.MISS | 灰球+斜杠 | 射门偏出 |
| `miss` | SHOT.MISS | 灰球+斜杠 | 射门偏出 |
| `turnover` | SHOT.MISS | 灰球+斜杠 | 进攻被断 |
| `penalty_goal` | PENALTY.GOAL | 白球+绿环+点球标记 | 点球命中 |
| `penalty_miss` | PENALTY.MISS | 灰球+斜杠+点球标记 | 点球射失 |

**场景标记的来源**：`data.shot.shotType`
- `LONG_SHOT`(4) → 远射准星
- 点球类（type 本身）→ 点球点
- 任意球直接射门（`data.shot.fromFreeKick`）→ 任意球弧
- 其余 → 无标记

**通道**：`data.lane`（`left` / `center` / `right`）。

### 4.2 犯规与牌（class 4）

| typeName | 码 | 图标 |
|---|---|---|
| `foul` | FOUL.WARNING | 哨子（P0 已重绘） |
| `yellow_card` | FOUL.YELLOW | 倾斜黄牌 |
| `red_card` | FOUL.RED | 直立红牌+白带 |

### 4.3 定位球（class 5 / 6）

| typeName | 码 | 图标 |
|---|---|---|
| `corner` | CORNER.TAKEN | 角旗 |
| `free_kick` | FREEKICK.TAKEN | 弧线+球（P1 重绘） |

### 4.4 比赛控制（class 2 / 8 / 9 / 16）

| typeName | 码 | 图标 |
|---|---|---|
| `kickoff` | KICKOFF | 中线+中圈+球（P0） |
| `half_time` / `full_time` | PERIOD.END | 钟面（P0） |
| `second_half` | PERIOD.START | 钟面 |
| `substitution` | TACTICAL.TACTICAL | 红绿对撞箭头 |
| `tactical_change` | TACTICAL.TACTICAL | **新增**：双向箭头+战术板 |
| `injury` | INJURY | 十字（P1 重绘） |
| `forfeit` | FORFEIT | 哨子+✕ |

### 4.5 环境与元事件（class 13–17）

| typeName | 码 | 图标 |
|---|---|---|
| `weather_announcement` | WEATHER | 天气字形（按 `data.weather`） |
| `attendance_announcement` | ATTENDANCE | 人群 |
| `player_introduction` | INTRO | 单人 |
| `snapshot` | SNAPSHOT | 不渲染 |

---

## 5. 悬停规范

组件：复用 `web/src/components/ui/Tooltip.tsx`（CSS-only、`group-hover` + `group-focus-within`、无 portal）。

- **触发区**：整个 24px 图标，不限于球体。
- **第一行**：事件名，13px / `text-body`，主色文本。
- **第二行**：事件码，11px / `text-label`，等宽字体（`font-mono`），`tracking-wider`，次级色。
- **布局**：两行左对齐；`side="top"` 默认，靠右侧时 `align="end"`；最大宽 240px。
- **时序**：出现 120ms 后，消失即时。
- **可达性**：`aria-label` = 事件名 + 码；键盘 focus 同样显示。
- **未知事件**：显示 `UNKNOWN`，不隐藏图标。

---

## 6. 标签组合规则

```
label = lane? + shotType? + outcome?
```

- 词表放 `web/messages/{zh,en}.json` 的 `commentary.lane.*` / `commentary.shotType.*` / `commentary.outcome.*`。
- 缺 `data` 时退回现有的整句 `commentary.types.<typeName>`。
- zh 用无空格连接（「左路抽射进球」），en 用空格（「Left · volley · goal」）。
- **不得**在 UI 里出现权重、公式等引擎内部数字（CLAUDE.md 约束）。

---

## 7. 实施步骤

| 步 | 内容 | 文件 |
|---|---|---|
| S1 | `event-code.ts` + 单测 | 新增 2 |
| S2 | 图标重写为「结果+标记」组合函数 | `commentary-icons.tsx` |
| S3 | 44 处调用点统一 24px | `MatchKeyEvents` / `CommentTicker` / `MatchTimeline` / `LiveCommentary` 等 |
| S4 | Tooltip 接入 + `commentary.*` 词表 + i18n 守卫 | `commentary-icons.tsx`、`messages/*.json` |
| S5 | 16 / 20 / 24 三档实尺寸截图验收 | `docs/perf/`（gitignored） |

S2 附带清理：删除 4 个方向变体（`GoalLeft`/`GoalRight`/`MissLeft`/`MissRight`）、`ShotOnTargetIcon`（与球重复）、`SaveIcon`（并入斜杠）、`OffsideIcon`（引擎不发）。

---

## 8. 验收

1. `grep -r "size={16}\|size={20}" web/src/components/match` 返回 0。
2. 任一事件行 hover 出「名称 + 码」两行。
3. 所有引擎可发出的 `typeName` 都有图标与码（单测遍历 `EVENT_TWO_AXIS`）。
4. 24px 下四个场景标记可区分；16px 降级时标记允许消失，主体仍可辨。
5. i18n 守卫 3/3 通过。

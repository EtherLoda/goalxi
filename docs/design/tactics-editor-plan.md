# 战术布置页改造计划

> 状态：待实施
> 前置提交：`600c3cc fix(tactics): repair the three visual defects in the tactics editor`
> 范围：`web/src/components/tactics/**`、`web/src/app/[locale]/matches/[id]/tactics/page.tsx`、一个后端小改

---

## 0. 已批准的决策

| 项 | 决定 |
|---|---|
| 桌面端信息架构 | **方案 B**：两个 tab ——「阵容」/「战术与换人」，共享同一份状态 |
| 移动端信息架构 | **三步向导** ——「阵容」→「战术」→「换人」，底部固定上一步/下一步/提交 |
| 实现方式 | 一套组件、两套外壳（tab 条 / 步骤条），不做两份实现 |
| 动效 | 引入 `motion`（已安装 14.3.0），配合已有的 CSS 时长阶梯 |
| 已完成的修复 | ①球场缩放压扁 ②换人行入场动画 ③拖到已占用位置无反馈 ④顺手修掉 reduced-motion 回归 |

### 非目标

- 不改引擎、不新增战术、不改四 slot 门槛规则
- 不改阵型模板与拖拽交互模型（仍是 HTML5 drag-and-drop）
- 不重写 `use-tactics-state.ts` 的 reducer 逻辑（只加一个字段和一个 action）
- 不做「一键最优阵容」之类的自动填充

---

## 1. 现状盘点

### 1.1 组件清单

| 文件 | 行数 | 职责 | 问题 |
|---|---|---|---|
| `editor/TacticsEditor.tsx` | 484 | 数据加载、拖拽状态、handlers、提交、渲染壳 | 一个文件承担 5 件事 |
| `editor/EditorBentoGrid.tsx` | 150 | 三列布局 | 列宽写死 `lg:grid-cols-[400px_minmax(0,1fr)_380px]`（`:82`） |
| `editor/EditorHeader.tsx` | 86 | 标题、阵型、未保存、倒计时、提交 | 5 个焦点竞争；标题与页面级 h1 重复 |
| `pitch/PitchField.tsx` | 137 | 球场 SVG + 24 槽 + 缩放 | — |
| `pitch/PositionSlot.tsx` | 126 | 单槽、投放、反向缩放 | — |
| `pitch/PlayerMarker.tsx` | 197 | 棋子（编辑器 + 比赛两种形态） | 字号 8-10px |
| `roster/PlayerRoster.tsx` | 148 | 名单 + 排序筛选 + 密度 | 自带滚动容器（`:73`） |
| `events/TacticalEventsPanel.tsx` | 115 | 换人/换位列表 | 自带滚动容器（`:96`） |
| `events/TacticalEventRow.tsx` | 200 | 单行 | 已换成 motion 入场 |
| `dimensions/DimensionsPanel.tsx` | 65 | 宽度 + 防线 | tempo 已整体删除（见 §7-Q1） |
| `presets/PresetList.tsx` | 62 | 预设读写档 | 常驻占位，实际低频 |
| `use-tactics-state.ts` | 431 | reducer + hydrate + lock tick | 稳定，只需小改 |
| `types.ts` | 445 | 类型 + PITCH_SLOTS(24) + 坐标 | — |
| `lineup-validator.ts` | 224 | 阵容合法性 | 需要接入战术门槛 |
| `api-helpers.ts` | 360 | 提交载荷组装 | — |

### 1.2 三个结构性问题

1. **三个独立滚动容器**：`EditorBentoGrid.tsx:84`（左列 `lg:overflow-y-auto`）、`PlayerRoster.tsx:73`（`flex-1 overflow-y-auto`）、`TacticalEventsPanel.tsx:96`（`max-h-[360px] overflow-y-auto`）。滚轮作用对象取决于指针位置。
2. **没有必做/可选的层级**：6 个面板视觉权重相同（都是 `GlassPanel size="md"`），但只有球场和名单是必做。
3. **战术与阵容必须同屏**：四 slot 硬门槛意味着「选了战术但阵容不够」必须立刻可见，否则玩家在 tab 间来回跳。

### 1.3 两处技术债（改造时必须一并处理）

- **两套拖拽状态**：`TacticsEditor.tsx:198-199` 用局部 `useState` 管 `isDragging`/`draggingFrom`，而 `shared/usePlayerDrag.ts`（69 行）是另一套且**编辑器没有使用**。切 tab 时局部状态不会清理，会留下假的拖拽阴影。
- **标题重复**：`page.tsx:76` 渲染 `<h1>战术</h1>`，`EditorHeader.tsx:40` 又渲染一次 `t('title')`。

---

## 2. 目标信息架构

### 2.1 桌面（`lg` ≥ 1024px）—— 两个 tab

```
┌──────────────────────────────────────────────────────────────┐
│ ← 战术   阿森纳 vs 切尔西                                     │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │  4-4-2 · 窄 · 防线低 · 双翼齐飞      [预设▾] ● 未保存       │ │
│ │  倒计时 1h 12m                              [ 提交战术 ]   │ │
│ └──────────────────────────────────────────────────────────┘ │
│  [ 阵容 ]  [ 战术与换人 ]          ← tab 条（滑动指示条）      │
├──────────────────────────────────────────────────────────────┤
│ 阵容 tab：                                                    │
│   左：球场 + 替补条          右（420px）：球员名单            │
│                                                               │
│ 战术与换人 tab：                                              │
│   顶部：维度(chip) + 五个战术(chip) + 门槛读数条              │
│   其下：换人计划（默认折叠，标题显示「已安排 2 次」）          │
└──────────────────────────────────────────────────────────────┘
```

- 战术 tab 里**球场不出现**，因此门槛读数条必须自带足够信息（见 §5）。
- 换人计划默认折叠 —— 90% 的比赛不动它。

### 2.2 移动（< 1024px）—— 三步

```
┌───────────────────────┐
│ ① 阵容 ─ ② 战术 ─ ③ 换人 │  ← 步骤条（当前步高亮，已完成打勾）
├───────────────────────┤
│                       │
│   当前步内容（单滚动区） │
│                       │
├───────────────────────┤
│ [上一步]      [下一步]  │  ← 固定底栏；最后一步右侧变 [提交战术]
└───────────────────────┘
```

- 阵容步：球场 + 替补条（名单折叠成底部抽屉，否则 4 屏滚动）
- 战术步：维度 + 五个战术 + 门槛读数
- 换人步：换人计划
- 尚未开始拖动就能看到当前阵容的族计数，不需要来回切

---

## 3. 组件地图

### 新增

| 文件 | 职责 |
|---|---|
| `editor/EditorTabs.tsx` | 桌面 tab 条；`layoutId` 滑动指示条；roving tabindex + 左右方向键 |
| `editor/EditorStepper.tsx` | 移动步骤条 + 固定底栏 |
| `editor/EditorWorkspace.tsx` | 取代 `EditorBentoGrid`：按当前视图渲染对应面板组合 |
| `editor/use-editor-viewport.ts` | `matchMedia('(min-width: 1024px)')` → `'desktop' \| 'mobile'`，`useSyncExternalStore` 实现避免水合闪烁 |
| `editor/use-url-tab.ts` | `?tab=` 读写（`useSearchParams` + `router.replace`，不产生历史记录） |
| `team-tactic/TeamTacticPicker.tsx` | 五个 chip + 「不选战术」+ 不可选态（缺 slot 时置灰并写明缺什么） |
| `team-tactic/LineupFamilyTally.tsx` | 族计数条（§5） |
| `team-tactic/use-team-tactics.ts` | 拉 `GET /game/team-tactics` 并缓存；返回定义表 + families 映射 |
| `team-tactic/requirement.ts` | 纯函数 `tallyFamilies(lineup, families)` / `checkRequirement(code, tally, defs)` |
| `shared/EditorStickyFooter.tsx` | 移动端固定底栏（桌面不渲染） |
| `presets/PresetDrawer.tsx` | 预设抽屉（list + save + delete），由 header 的按钮打开 |

### 改造

| 文件 | 改动 |
|---|---|
| `TacticsEditor.tsx` | 拆出数据加载到 `use-editor-data.ts`；拖拽统一到 `usePlayerDrag`；装配 workspace |
| `EditorHeader.tsx` | 加战术摘要 + 预设按钮；阵型降为 mono 小标签；倒计时在 <10min 时升为视觉最强者 |
| `use-tactics-state.ts` | `draft.teamTactic` + `SET_TEAM_TACTIC`；`SUBSTITUTIONS` 上限校验已有 |
| `types.ts` | `TacticsDraft.teamTactic`、`EditorView` 类型、`MAX_VOLUNTARY_SUBSTITUTIONS` 旁加 `TEAM_TACTIC_LABELS` 的键名常量（显示名走 i18n） |
| `lineup-validator.ts` | 增加 `validateTeamTactic(lineup, tactic, defs)`，产出 `validation.tacticMissing` |
| `api-helpers.ts` | 提交载荷加 `teamTactic`；`hydrateFromTactics` 读 `teamTactic` |
| `DimensionsPanel.tsx` | 两个 chip 变成一排（宽度/防线）+ 一个球队战术入口（tempo 已删除，见 §7-Q1） |

### 删除

| 文件 | 原因 |
|---|---|
| `editor/EditorBentoGrid.tsx` | 被 `EditorWorkspace` 取代 |

---

## 4. 状态与 URL

### 4.1 数据状态（reducer）

```ts
export interface TacticsDraft {
  lineup: LineupMap;
  bench: BenchMap;
  events: TacticalEvent[];
  pitchWidth: PitchWidthValue;
  defensiveLine: DefensiveLineValue;
  teamTactic: TeamTacticCode | null;   // 新增；null = 不选战术
  activePresetId: string | null;
  isDirty: boolean;
}
```

- 新 action：`{ type: 'SET_TEAM_TACTIC'; tactic: TeamTacticCode | null }`
- `HYDRATE` / `APPLY_PRESET` 需要带上 `teamTactic`（预设现在也存这四个参数）
- 无需 undo

### 4.2 视图状态（URL）

```ts
type EditorTab = 'lineup' | 'tactics' | 'changes';
```

- 桌面 tab 与移动 step **共用同一个值**：桌面把 `changes` 显示为 `tactics` tab 内的折叠区，但 URL 仍允许 `?tab=changes`（移动分享链接时保留）。
- 缺失/非法值 → 默认 `lineup`。
- 用 `router.replace(url, { scroll: false })`，避免污染后退栈。
- 首次进入且比赛已锁定、阵容却因战术不满足而不可提交时 → 默认 `tactics`（把玩家送到需要修的地方）。

### 4.3 瞬时状态（不进 reducer）

- `isDragging` / `draggingFrom`：统一到 `shared/usePlayerDrag.ts`，并暴露 `reset()`。
- **切 tab/step 时调用 `reset()`** —— 这是一条必须写进代码注释的规则：卸载 `PitchField` 会丢掉它自己的 `dragOverSlot`，但 `usePlayerDrag` 的 `isDragging` 在父层，不重置会留下全局拖拽阴影。

---

## 5. 战术门槛读数

### 5.1 后端小改（必须先做）

`GET /api/v1/game/team-tactics` 目前只回 `{ code, requirements }`。前端没有 `@goalxi/database` 依赖（`web/package.json` 无此包），若在前端硬编码 24 键 → 8 族的映射，就会与 `libs/database/src/constants/team-tactics.constants.ts` 的 `POSITION_FAMILIES` 永久存在漂移风险（新增一个槽位时前端静默出错）。

**改法**：响应体增加 families 映射。

```ts
export class TeamTacticsResDto {
  tactics: TeamTacticResDto[];
  families: Record<string, PositionFamily>;   // 24 个规范键 + 27 个旧别名
  familyOrder: PositionFamily[];              // 展示顺序，避免前端再定一次
}
```

对应改 `api/src/api/game/game.controller.ts` 与 `api/src/api/game/dto/team-tactics.res.dto.ts`，并补 `game.controller.spec.ts` 断言（已有 5 个用例的骨架）。

### 5.2 前端计算

```ts
// team-tactic/requirement.ts
export function tallyFamilies(
  lineup: LineupMap,
  families: Record<string, PositionFamily>,
): Record<PositionFamily, number>;
```

- 纯函数、O(24)、无副作用 → 直接 `useMemo([draft.lineup, families])`
- 不满足时产出 `{ missing: { family, need, have }[] }`

### 5.3 展示

```
CB 3/2 ✓   FB 1/2 ✕   DM 1/1 ✓   CM 2/3 ✕   AM 1/1 ✓   W 0/2 ✕   CF 1/1 ✓
双翼齐飞：还缺 1 个 FB、2 个 W
```

- 满足：中性色（`text-on-surface-variant`）
- 缺：金色（`text-tertiary`）+ 数字加粗
- **不用绿色表示「满足」** —— 绿色在这个页面已经是「主行为」的语义（见 §7-08）
- `aria-live="polite"`，值变化时朗读「双翼齐飞还缺 2 个边」
- 战术 chip 不可选时（缺 slot）：置灰 + tooltip 说明缺什么，但仍可点击查看说明（不是完全禁用）

### 5.4 提交闸门

- 客户端：`validation.tacticMissing.length > 0` → 提交按钮禁用 + 面板内红字说明
- 服务端已有硬校验（`match.service.ts` 的 `checkTacticRequirement`），客户端只是提前反馈，不是新增规则

---

## 6. 动效系统

### 6.1 时长与缓动（单一来源）

新增 `web/src/lib/motion.ts`，与 `globals.css:192-195`（缓动）、`:225-243`（时长）**一一对应**：

```ts
export const DURATION = { instant: 0.1, quick: 0.15, base: 0.2, slow: 0.3, deliberate: 0.5 } as const;
export const EASE = {
  standard: [0.2, 0, 0, 1],
  entrance: [0.05, 0.7, 0.1, 1],
  exit: [0.4, 0, 1, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const;
```

改一处必须同步另一处 —— 在两边都写「同步自 / 同步到」的注释。

### 6.2 动效清单

| 元素 | 动效 | 时长 | 缓动 |
|---|---|---|---|
| 面板首次入场 | `opacity 0→1` + `y 8→0`，错开 40ms | `base` | `entrance` |
| tab 指示条 | `layoutId` 滑动 | `base` | `standard` |
| tab 内容切换 | 淡出→淡入（不做横向位移，避免与滚动冲突） | `quick` | `standard` |
| 移动步骤切换 | 按方向 `x ±24` + 淡入 | `base` | `entrance` |
| 换人行增删 | 入场 `x -8`；退场 `opacity→0, height→0` | `base` | `standard` |
| 球场棋子随宽度/防线移动 | `layout` | `slow` | `standard` |
| 预设抽屉 | 从 header 展开 `y -8` + 淡入 | `base` | `entrance` |
| 门槛读数变化 | 数字 `scale 1→1.08→1`（仅变化项） | `quick` | `spring` |

**约束**：`prefers-reduced-motion` 已由 `MotionProvider`（`reducedMotion="user"`）接管，所有 motion 动画在该模式下退化为瞬时。新增动画不需要各自判断。

### 6.3 动效边界

- 只给「状态确实变了」的瞬间加动效。滚动、输入、拖拽跟手都**不加**过渡（拖拽跟手加过渡会变成橡皮筋）。
- 不做页面级入场动画（进页面已经在加载数据，再加动画会拖慢第一眼）。

---

## 7. 视觉修复清单

来自页面审计，按阶段归属。编号用于 commit message 引用。

| # | 问题 | 位置 | 改法 | 阶段 |
|---|---|---|---|---|
| V01 | `transition-all` 8 处 | `PlayerMarker.tsx`、`PositionSlot.tsx`、`BenchSlot.tsx:59,86`、`PresetCard.tsx:20`、`RosterPlayerCard.tsx:36`、`DetailedRosterPlayerCard.tsx:66`、`DimensionSegmented.tsx:42` | 收敛为 `transition-[border-color,background-color,box-shadow,transform]` | 4 |
| V02 | 选中用 `scale-110`/`scale-105` 两个值，且会挤动相邻 | `PositionSlot.tsx`、`BenchSlot.tsx:89,94`、`PlayerMarker.tsx` | 统一改成 ring，不做缩放 | 4 |
| V03 | 绿色一色多义（提交/选中/激活/正常） | 全局 | 绿=主行为；选中=中性 ring；警示=金 | 4 |
| V04 | 字号 8/9px 泛滥 | `PlayerMarker.tsx:171,174,177`、`BenchSlot.tsx:59`、`PresetCard.tsx:52`、`RosterFilters.tsx:45` | 下限 10px；8-9px 只留非必要元数据 | 4 |
| V05 | `backdrop-filter: blur(16px)` 用在 6 个面板，其中一个是滚动容器 | `globals.css:297-300` | 移动端关闭（`@media (max-width: 1023px)` 覆盖为不透明底色） | 4 |
| V06 | 球场线条 0.18 alpha 偏淡、条纹 0.20 偏重 | `PitchField.tsx:65,70-81` | 线条 → 0.30，条纹 → 0.10 | 4 |
| V07 | 防线高度只靠一个几乎看不见的外发光 | `PitchField.tsx:48-49` | 换成中场圆呼吸（`motion` `animate` + `repeat: Infinity`），并受 reduced-motion 约束 | 4 |
| V08 | 空槽只在拖拽时出现，结构不可见 | `PositionSlot.tsx:92-94` | 常驻 15% 虚线圆，拖拽时变实 | 4 |
| V09 | header 5 个焦点竞争 | `EditorHeader.tsx:36-73` | 阵型降为 mono 标签；<10min 时倒计时升为最强者 | 3 |
| V10 | 入口按钮无限 `animate-pulse` | `TacticsEntryButton.tsx:72,91` | 改一次性 ping 或静态点 | 4 |
| V11 | 加载态整页 spinner 换掉三列 | `TacticsEditor.tsx:399-405` | 布局保持的骨架屏（骨架已在 `page.tsx:90-103`，复用） | 3 |
| V12 | 标题重复两处 | `page.tsx:76` + `EditorHeader.tsx:40` | 页面级保留 h1，`EditorHeader` 里删掉标题只留状态行 | 3 |

### 两个待定的问题

**Q2（预设入口）—— 已决定：不做最近使用快捷按钮。**

预设整体移进 header 抽屉，应用预设固定为「打开抽屉 → 点一个」。不保留 header 里的最近使用入口。

**Q1（tempo）—— 已决定：整个维度删除（2026-10-18）。**

审查发现 tempo 在引擎里只有两处真实效果，其中一处还是死参数：

| 参数 | 状态 | 位置 |
|---|---|---|
| `duelK` | 生效 | `simulator/src/engine/match.engine.ts`，映射成推进对决曲线的 amplification（SLOW 1.26 / BAL 1.5 / FAST 1.74） |
| `attackTypeWeights` | 生效 | `match.engine.ts`，与天气、路权重相乘后决定进攻方式 |
| `counterVulnerability` | **失效** | 算出的 `counterBonus` 乘进 `effectiveAttPower`，但断球后 `pushSuccess = true` 直接跳过推进判定，`effectiveAttPower` 再也没有被读过 |
| `shotAttempts` | **失效** | `simulator/src/engine/tactics/tactics-presets.ts` 里声明并赋了 0.9 / 1.0 / 1.1，全仓库没有任何读取点 |

实测（N=500/格，锚点改到 1.5 之后）：推进率 SLOW 53.4% / BAL 53.0% / FAST 50.7%（12v12），主胜 39.4 / 37.6 / 40.8，进球 1.65 / 1.69 / 1.74。胜率与进球全部落在 ±2.1pp 的噪声内。

结论：这个维度既没有可信的机制，也没有可信的实测差异，而编辑器从未提供过它的控件（`DimensionsPanel` 只渲染宽度 + 防线）。**保留一个玩家看不见、引擎里半死的参数只会增加维护负担**，因此整体删除：引擎枚举与参数、实体列、API DTO、前端类型、预设字段、手册全部移除。

删除后的战术层是 **2 个维度（宽度 / 防线）+ 1 个球队战术**。

---

## 8. 无障碍与键盘

| 项 | 要求 |
|---|---|
| tab 条 | `role="tablist"`，`role="tab"`，`aria-selected`，roving `tabIndex`，左右方向键切换，Home/End 到首尾 |
| tab 面板 | `role="tabpanel"`，`aria-labelledby` 指向对应 tab |
| 移动步骤 | `aria-current="step"`，底栏按钮 `aria-label` 含步骤名 |
| 门槛读数 | `aria-live="polite"`，`role="status"` |
| 拖拽替代 | `PositionSlot` 已可聚焦（`role="button"`）；补：Enter 拾起 → 方向键选目标 → Enter 放下 → Esc 取消。**最小可用即可**，不追求完整 a11y 拖拽 |
| 焦点管理 | 切 tab 后焦点移到面板首个可聚焦元素；抽屉/对话框焦点陷阱 |

---

## 9. i18n 键位

新增（`web/messages/{zh,en}.json`，`tactics.*` 下）：

```
tactics.tabs.lineup / tactics.tabs.tactics / tactics.tabs.changes
tactics.steps.of / tactics.steps.prev / tactics.steps.next / tactics.steps.finish
tactics.teamTactic.title / .none / .missingCount / .locked / .lockedHint
tactics.teamTactic.code.possession / .high_press / .counter / .central / .wings
tactics.family.GK/CB/FB/DM/CM/AM/W/CF
tactics.summary.format        // "{formation} · {width} · {line} · {tactic}"
tactics.presets.open / .apply / .saveNew / .delete
tactics.events.collapsed      // "已安排 {count} 次"
tactics.skeleton.loading
```

注意：战术显示名与手册第 28 章的用词必须一致（传控压迫 / 高位逼抢 / 防守反击 / 中路渗透 / 双翼齐飞）。

---

## 10. 分阶段实施

每个阶段独立可验证、可回滚。建议一个阶段一个 commit。

### Phase 1 — 抽壳（不动内部布局）

**状态**：✅ 已完成。

**改动**
1. 新增 `use-editor-viewport.ts`、`use-url-tab.ts`、`EditorTabs.tsx`、`EditorStepper.tsx`
2. `EditorBentoGrid` → `EditorWorkspace`，按视图渲染；内容布局先照抄现状（三列）
3. 拖拽状态统一到 `usePlayerDrag`，切视图时 `reset()`
4. `page.tsx` 移除重复标题

**实施记录**

- `useEditorViewport` 用 `useSyncExternalStore`，服务端快照固定返回 `'desktop'`。选 desktop 而不是 mobile 是因为它是内容超集：猜错时手机上只是多一帧标签条，猜反向时桌面上会多一帧步骤条 + 固定底栏，跳动更大。
- `useEditorDrag` 加在 `shared/usePlayerDrag.ts` 里（而不是新建文件），与计划写的「统一到 `usePlayerDrag`」一致；`usePlayerDrag(playerId)` 本身仍是每张卡片的叶子 hook，没有改动。
- 桌面 `changes` 折叠进战术 tab：URL 里 `?tab=changes` 合法（手机分享链接不失效），桌面高亮战术 tab。
- 移动端 `EditorHeader` 新增 `showSubmit`，手机端把主按钮交给固定底栏，避免同一屏两个主按钮。
- `page.tsx` 的 `<h1>` 从「战术」改为对阵双方，`EditorHeader` 的标题降级为 `<p>` —— 之前一页有两个 h1。
- `EditorBentoGrid.tsx` 已删除（无引用）。

**验收**：桌面两个 tab 都在、状态跨 tab 保持；移动三步可前进后退、状态保持；拖拽中切 tab 无残留；`?tab=tactics` 可直接打开。

**风险**：`useSyncExternalStore` 与 SSR 水合。必须保证服务端快照返回 `'desktop'`（或首个快照与客户端一致），否则首帧跳动。

### Phase 2 — 战术门槛数据层

**状态**：✅ 已完成（commit `832fe3b`）。

**改动**
1. 后端：`TeamTacticsResDto` 增加 `families` / `familyOrder`；`game.controller.ts` 返回；spec 补断言
2. 前端：`use-team-tactics.ts`、`requirement.ts`（纯函数 + 单测）
3. `use-tactics-state.ts`：`draft.teamTactic` + `SET_TEAM_TACTIC`；hydrate/preset/API 载荷接线
4. `lineup-validator.ts`：`validateTeamTactic`

**验收**：单测覆盖 tally 与 missing 计算；`?tab=tactics` 能看到一个只读的计数条（还没有 chip）。

**风险**：现有已提交的战术行 `team_tactic` 为 NULL → 必须渲染成「不选战术」而不是「未知」。

### Phase 3 — 战术面板与布局瘦身

**状态**：✅ 已完成。

**改动**
1. `TeamTacticPicker.tsx`（五个 chip + 不选 + 不可选态）
2. `LineupFamilyTally.tsx` + `aria-live`
3. `DimensionsPanel` 变成一排 chip
4. 换人计划默认折叠（`TacticalEventsPanel` 加 `collapsible`）
5. 预设移入 `PresetDrawer`，header 加按钮
6. `EditorHeader` 重排（V09、V12）+ 战术摘要
7. 阵容 tab 变两栏（球场 + 名单 420px）；骨架屏（V11）

**验收**：五个战术可选中/取消；缺 slot 时 chip 置灰并说明；提交闸门生效；三个滚动容器降到 1 个以内。

**风险**：桌面两栏后球场变宽，`aspect-[3/4]` 会变高，可能出现纵向溢出 —— 需要给球场 `max-h` 并让名单独立滚动。

**实施记录**

- 门槛闸门落在 `lineup-validator.ts` 的第 12 条规则，而不是新增一个 `validateTeamTactic`：`ValidationContext` 加可选 `tacticGate`，由 `TacticsEditor` 用 `checkTactic` 算好后传入。可选是刻意的 —— 需求表还在路上（或请求失败）时，校验器不能凭空判一个它没法检查的战术有罪，否则前端会在首帧就禁掉提交。
- 需求表 `useTeamTactics` 被调用两次（`TacticsEditor` 一次、`EditorWorkspace` 一次），因为它在模块作用域缓存：第二次是纯命中，不会多发请求。
- 不可选的 chip 用 `aria-disabled` 而不是 `disabled`，键盘用户仍能聚焦到它读到 `title` 里的缺失原因；点它不改变选择（门槛是硬的，没有「部分生效」）。
- 球场宽度上限用的是 `lg:max-w-[calc((100vh-300px)*0.75)]` 而不是 `max-h`：`aspect-[3/4]` 下限制 max-height 会让宽度先算出再被压，比例和位置都会抖；反过来限制宽度，高度自然满足。
- 名单栏从 `max-h` 改成 `lg:h-[calc(100vh-150px)]`：`PlayerRoster` 是 `flex flex-col h-full`，列表是 `flex-1 overflow-y-auto`，祖先没有确定高度时它不会滚动，只会把整页撑高。
- 骨架屏（V11）复用了 `page.tsx` 的脉冲色块，但按新布局摆位（header + tab 条 + 球场/名单两栏），因为改版后原来的三列骨架已经对不上。

### Phase 4 — 视觉与动效

**状态**：✅ 已完成。

**改动**
1. `web/src/lib/motion.ts`
2. V01–V08、V10 逐项修复（见 §7）
3. 动效清单（§6.2）逐项落地
4. 移动端关闭 backdrop-filter

**验收**：`prefers-reduced-motion: reduce` 下所有动效瞬时完成（手动验证 + 一条 Playwright 用 `emulateMedia`）；滚动容器无卡顿；字号最小 10px 的地方可读性检查。

**风险**：`layout` 动效作用在 24 个绝对定位元素上会触发频繁重排，需实测帧率，必要时退化为 CSS transition。

**实施记录**

- **V01 用的是 `transition` 而不是逐个列属性**：Tailwind 的裸 `transition` 恰好等于「颜色 / 背景 / 边框 / 透明度 / 阴影 / transform」，正好排除了出问题的 `width/height/margin`。唯一例外是 `TacticsEntryButton` 里那根靠 `margin-left` 滑入的箭头，它需要 `transition-[opacity,margin]`，因为裸 `transition` 不含 margin。
- **V02 的选中态改 ring 而不是缩小 scale**：拖拽态原本同时有 `opacity-30` 和 `scale-90`，两者一起把卡片从槽位上「拿起来」，导致同一时刻位置信息有两套。现在只剩透明度，位置只由 ring 表达。
- **V03 的绿/金语义是反的，已对调**：原本 drop-target 用金色（=警示）、选中的球员用绿色（=主行为）。现在绿色只归 drop-target（"松手就落在这里"，是动作），金色只归 GK 槽和未保存提示（警示），选中态换成中性 ring。
- **V05 用 `max-width: 1023px` 关掉 backdrop-filter**：`@media (max-width: 1023px)` 里把 `.glass-panel` 换成不透明 `surface-container-low`。选 1023 而不是 768 是因为三栏布局在 lg 才成立，平板竖屏同样在滚名单栏。
- **V07 没有沿用「外发光」**：发光只表达「有变化」，不表达「防线在哪」。改成球场内的一条带 + 一个呼吸圆，位置直接对应低/中/高；呼吸用 `repeat: Infinity`，但在 `prefers-reduced-motion` 下由 `MotionProvider` 统一降为瞬时。
- **V08 的空位从「拖拽时才出现」改成常驻 15% 虚线**：原实现只有在拖拽中才渲染空槽，等于把阵型结构藏起来；现在常驻但不抢注意力，拖拽时才实心化。
- **`layout` 动效没有用在 24 个棋子上**：棋子已经在 `transform: scaleX()/translateY()` 的父容器里，父容器本身就是 300ms CSS 过渡，再加 `layout` 会同时量测再补间，变成双重位移。§6.2 那一行由父容器已有过渡满足。
- **换人行退场需要稳定 key**：原来是 `key={event-${idx}}`，删中间一行时 React 会复用下一行的 DOM，退场动画和输入框焦点都会错位。给 `TacticalEvent` 加可选 `id`（reducer 分配，`serializeTactics` 逐字段取所以不会发给 API），列表 key 改成 `event.id`，外面套 `AnimatePresence`。可选是刻意的：历史 hydration 之外还有大量测试用字面量构造事件，强制必填要改二十多处。
- **面板入场做的是整块而不是逐面板 40ms 错开**：逐面板错开需要给六个面板各包一层 `motion.div`，其中名单栏和事件栏是滚动容器，加包裹层会改变高度计算。退一步只在 tab 内容整块做 8px 上浮，信息量不变。
- **tab 内容在桌面只淡入、不横移**：桌面内容会在自己的列里滚动，横向位移会和滚动条视觉打架；移动端三步才按方向 ±24 位移。
- **顺手修掉的 lint**：`EditorWorkspace` 里判断移动方向原本用 `useRef` 在渲染期读 `.current`，被 `react-hooks/refs` 判错，改成 `useState`。

### Phase 5 — 键盘与无障碍

补 §8 的键盘替代与焦点管理。

**验收**：只用键盘完成「选阵型 → 放 11 人 → 选战术 → 提交」。

**状态**：✅ 已完成。

**实施记录**

- **放置球员的键盘替代不是「用方向键模拟拖拽」，而是一个原生 `<select>`**：在空位上按 Enter 弹出一个只有未上场球员的 `<select>`，选中即落位。理由是自己写 listbox 要处理 roving tabIndex、typeahead、滚动跟随、屏幕阅读器播报，而 `<select>` 三样全都自带；键盘用户真正缺的是「不靠指针也能把球员放上去」，不是「能用方向键搬运一张卡片」。
- **移动已有球员走「Enter 拾起 → 方向键 → Enter 放下」**：`pickedSlot` 状态放在 `PitchField`，而不是每个槽位各存一份。方向键用 `neighbourSlot()` 找几何最近的槽位（前向距离权重 1.0、侧向 1.6，所以斜邻位永远输给正邻位），找到后**真的把 DOM 焦点移过去**——不移焦点，屏幕阅读器不会播报新位置，等于什么都没发生。
- **一个槽位只能有一个可聚焦元素**：有球员时是 `PlayerMarker`（原本就 `role="button" tabIndex={0}`），空位时是 `PositionSlot` 的外层 `div`（动态加 `tabIndex={0} role="button" aria-label={slot}`）。两者都在 `PitchField` 的同一个 `onKeyDown` 里处理，因为 keydown 会从内层冒泡上来——否则 24 个槽位要重复 24 份按键逻辑。
- **`role="button"` 的那次判断刻意跳过 `<button>`**：球员卡上的删除按钮是真正的 button，Enter/Space 应该由它自己处理，否则会被拾起逻辑吃掉。
- **tabpanel 的焦点接管加了首挂载守卫**：切 tab 后把焦点移进新面板，否则键盘用户在 tab 按钮上按 Tab 会走进另一个 tab 的内容。但页面初次挂载时绝不能抢焦点（会滚动页面），所以用一个 `hasMountedRef` 跳过第一次。
- **`role="tabpanel"` 只在桌面加**：移动端是 stepper（`<nav>` + `aria-current="step"`），不是 tablist，套上 tabpanel 会让屏幕阅读器读出一组不存在的 tab。
- **底栏按钮的 `aria-label` 带上目标步骤名**：「上一步」在屏幕阅读器里只是一个动词，加上「上一步: 阵容」才知道会去哪。
- **门槛读数条用 `role="status"`**：`aria-live="polite"` 之前只加在容器上，没有 role，部分屏幕阅读器不会把它当状态区。

### Phase 6 — 文档

1. 手册第 16 章（替补与指令）更新界面操作描述与新的三步流程
2. 手册第 15 / 28 章若描述到界面，同步
3. `web/src/data/manual/index.json` 升版本 + changelog

---

## 11. 测试计划

### 单元（Jest）

| 目标 | 用例 |
|---|---|
| `requirement.ts` | tally 正确；不同阵型下 missing 正确；旧槽位别名（DMFL/CAML/ST）计入正确族 |
| `use-tactics-state.ts` | `SET_TEAM_TACTIC` 置脏；hydrate 读回；preset 应用带战术 |
| `lineup-validator.ts` | 战术不满足时 `tacticMissing` 非空且不阻塞其它校验 |
| `use-url-tab.ts` | 非法值回落 `lineup`；切换不发历史记录 |

### E2E（Playwright）

| 场景 | 断言 |
|---|---|
| 桌面切 tab 再切回 | 阵容、战术选择都没有丢 |
| 移动三步前进后退 | 同上；底栏在最后一步变成「提交战术」 |
| 选一个缺 slot 的战术 | 提交按钮禁用 + 说明文案出现 |
| 拖拽中切 tab | 切回后没有拖拽阴影、`isDragging` 为 false |
| 减少动效模式 | 切 tab 不产生位移动画 |

### 视觉回归

现有 Playwright 视觉用例若覆盖战术页需重新基线（布局必然变化）。

---

## 12. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 两栏后球场过高，超出一屏 | 中 | 球场 `max-h-[calc(100vh-260px)]`，名单独立滚动 |
| `layout` 动效在 24 元素上掉帧 | 中 | 先测，退化到 CSS |
| 移动端抽屉与浏览器地址栏抢空间 | 低 | 用 `dvh` 而非 `vh` |
| 前端与后端 families 映射漂移 | 高 | families 由接口下发（§5.1），前端不复制 |
| 用户已保存的战术在界面消失 | 高 | hydrate 必须读 `teamTactic`；NULL → 「不选战术」 |
| 五个战术的数值仍未被验证为平衡 | 中 | 与本次改造无关；手册已如实写明差距在噪声内 |

---

## 13. 工作量估算

以「一人、熟悉代码」为基准：

| 阶段 | 估算 | 说明 |
|---|---|---|
| Phase 1 抽壳 | 1.5 天 | 视图抽象 + 状态统一，最容易低估的是拖拽清理 |
| Phase 2 数据层 | 1 天 | 后端 2 小时，前端纯函数 + 接线 6 小时 |
| Phase 3 面板与布局 | 2 天 | 新组件最多，布局返工风险最高 |
| Phase 4 视觉动效 | 1.5 天 | 12 项修复，多数是机械劳动 |
| Phase 5 无障碍 | 1 天 | 键盘拖拽替代是唯一有难度的部分 |
| Phase 6 文档 | 0.5 天 | — |
| **合计** | **~7.5 天** | 不含 E2E 编写与视觉基线重做（+1 天） |

若只做「最小可交付」（Phase 1 + 2 + 3），约 4.5 天，就能让玩家真正选到战术。Phase 4/5 可以随后单独排。

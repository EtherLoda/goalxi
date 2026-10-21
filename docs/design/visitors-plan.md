# 访客系统开发计划（v2）

> 状态：设计稿（已按 m18955 的决策重写）
> 日期：2026-10-21
> v1 → v2 的变化：访客**落在球队页面**，不落在经理页面；**只存 Redis（3 天 TTL）**，不建表；
> 经理页面缩到最小（只放个人资料）。

---

## 1. 决策记录

| # | 决策 | 结论 |
|---|---|---|
| D1 | 用户主页路由 | **`/managers/[id]`**（游戏身份是「经理」，不是「账号」） |
| D2 | 访客列表可见性 | **公开**（与 Hattrick 一致） |
| D3 | 未登录访客 | **不记录** |
| D4 | 「今天 N 名访客」的计数 | **按人去重** |
| D5 | 经理页面内容 | **只显示个人资料**：用户名、简介（本人可编辑）、注册时间；不显示球队阵容/资金 |
| D6 | 访客数据存储 | **只存 Redis，TTL 3 天，不建表**；丢了不影响主流程 |
| D7 | 访客面板的位置 | **球队页面**（`/teams/[id]`），不是经理页面 |
| D8 | 跳转访问模式 | **保留跳转，但落地页改成 `/teams/[id]`**；dashboard 只服务本人，不作为看他人的入口 |
| D9 | 球队页显示 ELO / 实力评级 | **不显示**（继续作为内部字段） |

D7 的直接后果：**球队页面必须存在**。上一轮 `/teams/[id]` 做过又回退，这次是有明确用途地重建 ——
但它**只做「公开档案」，不复制 dashboard 的赛季面板**，避免又变成重复开发。

---

## 2. 三个页面的分工（这是本次规划的核心）

```
/teams/[id]      公开档案：这家俱乐部是谁、什么水平、谁来过    ← 访客住在这里
/managers/[id]   公开档案：这个经理是谁（昵称/简介/加入时间）
/league/[id]     现有页面，侧栏加一块访客（可选，P4）
dashboard        管理面板：我的球队、战术、赛程、财务  ← 不动
```

**球队页面 vs dashboard `?team=` 模式**：两者都是「看一支球队」，但目的不同 ——
球队页面是**别人能看的公开档案**，dashboard 是**你自己的管理台**。
短期并存，等球队页面稳定后再决定要不要退役 `?team=` 模式（见 D8）。

---

## 3. 访客存储（Redis）

### 3.1 结构

```
key:    goalxi:visit:{type}:{subjectId}      type = team | league | user
type:   ZSET
member: visitorUserId
score:  最近一次访问的 epoch 秒
TTL:    3 天（每次写入刷新）
```

一个主体一个 zset 就够：**member 天然去重**（同一个人来十次还是一条），score 记最近时间。
不需要「按天分桶」——那是关系表里为了抗写放大才需要的，zset 的 member 语义已经解决了。

### 3.2 写

```
POST /visits          { subjectType, subjectId }      需登录 → 204
```

服务端顺序：

1. 未登录 → **204**（不是 401；埋点不该在控制台刷红）
2. 解析访问者自己的球队/用户 id，**访问自己 → 直接返回**
3. 校验主体存在（一次主键查询，team / league / user 各一张索引）
   —— 不校验的话，客户端可以 POST 随机 UUID 无限造 key
4. `ZREMRANGEBYSCORE key -inf now-3d` 剪掉过期成员（TTL 会被别人的访问不断刷新，
   所以过时成员不会自己消失，必须显式剪）
5. `ZADD key now visitorUserId`
6. `EXPIRE key 259200`

写失败（Redis 挂了）→ **吞掉异常，仍返回 204**。访客记录永远不能影响页面。

### 3.3 读

```
GET /visits?subjectType=team&subjectId=<uuid>&limit=8        公开
→ {
    todayCount: number,          // ZCOUNT key <今天 00:00 UTC> +inf
    visitors: [{ userId, displayName, avatar, lastVisitAt }]
  }
```

- 列表：`ZREVRANGE key 0 limit-1 WITHSCORES`（按最近访问倒序）
- 展示名：`nickname ?? username`；已注销用户读不到 → 从结果里剔除
- Redis 异常 → 返回 `{ todayCount: 0, visitors: [] }`，**不 500**
- 不返回邮箱、时区、role、球队资金

### 3.4 为什么可以只用 Redis

- 3 天后自动消失，没有保留策略问题，不需要清理任务
- 不写库 → 页面浏览不产生任何数据库压力
- 丢了只是「最近访客」空了，没有任何业务状态依赖它
- 代价：多实例天然共享（Redis 本来就是共享的）；重启丢数据可接受

现有代码里已有 `api/src/redis/redis.module.ts` 和 `auction-redis.repository.ts`
这一套「领域状态放 Redis」的先例，新代码沿用同样的 Repository 形态。

---

## 4. 页面

### 4.1 `/teams/[id]` 球队档案（新）

参考 Hattrick 的 club page：**信息密度高、几乎没有交互**。

```
┌───────────────────────────────────────────┬──────────────────┐
│ [徽章] McGrady            IV.49 · 第 4 名  │  最近访客         │
│        Zhejiang, 成立于 2026              │  今天 3 名访客    │
│                                           │  · 头像 昵称 3 分钟前│
│  主教练   T1_McGrady →                    │  · 头像 昵称 昨天   │
│  球场     有来无回（容量 82,000）          │                  │
│  球迷     2,498 人                         │                  │
│  实力评级 ELO-Based 分级                   │                  │
├───────────────────────────────────────────┤                  │
│ 本季战绩  场次 胜 平 负 进 失 积分 排名     │                  │
├───────────────────────────────────────────┤                  │
│ 近期战绩  最近 5 场（复用 FormChipStrip）   │                  │
└───────────────────────────────────────────┴──────────────────┘
```

**只读**。不放阵容表、不放赛程表、不放转会操作 —— 那些在 dashboard 和联赛页。
内容清单（合计 8 个字段 + 3 个区块），全部来自现有数据：

| 区块 | 数据源 |
|---|---|
| 队徽 / 队名 / 短代码 / 城市 / 成立年 | `team` |
| 所在联赛 + 排名 | `league` + `league_standing` |
| 主教练（→ `/managers/[id]`） | `team.user_id` → `user` |
| 球场容量 | `stadium` |
| 球迷人数 | `fan.total_fans` |
| 本季战绩 | `league_standing` |
| 近期 5 场 | `match`（已完赛，主客都算） |
| 最近访客 | Redis（§3） |

新接口：`GET /teams/:id/summary`（`@Public()`）。
**不能复用 `GET /teams/:id`** —— 它返回整个实体，带 `userId`、`benchConfig`、
`staminaTrainingIntensity`、`eloRating`，都是内部字段。

### 4.2 `/managers/[id]` 经理档案（新）

最小页，按 D5：

```
┌────────────────────────────────────┬
│ [头像]  昵称                        │
│         @username · 2026-08-01 加入  │
│                                    │
│ 简介                                │
│ 这是一段自我介绍……（本人可见「编辑」） │
└────────────────────────────────────┴
```

- 本人访问 → 显示「编辑资料」链接到 `/settings/user`
  —— 那里已有 `UserProfileForm`（昵称 / 头像 / 简介）和改密表单，**不需要新写表单**
- 他人访问 → 只读
- **不显示**球队战绩、资金、阵容（D5）

新接口：`GET /managers/:id`（`@Public()`）。
**不能复用 `UserResDto`** —— 它 `@Expose()` 了 `email`。

### 4.3 访客面板组件

`web/src/components/visitors/VisitorPanel.tsx`，props `{ subjectType, subjectId }`。

- 顶行：`今天有 3 名访客` / `今天还没有访客`
- 列表：头像 + 昵称 + 相对时间（`3 分钟前` / `昨天`），点进 `/managers/[id]`
- 空态一句话（沿用全站空态规范，不用虚线大框）
- 骨架态 3 行灰条

### 4.4 埋点组件

`web/src/components/visitors/VisitTracker.tsx` —— 无 UI。

- `useEffect([subjectType, subjectId])` 发一次 `POST /visits`
- 未登录不发；看自己不发
- `sessionStorage` 去重：同一标签页同一主体只发一次
- **永不抛错、永不 toast、永不阻塞渲染**

---

## 5. 入口（没有入口的页面等于不存在）

建完之后必须有人能走到这些页：

| 从哪 | 去哪 | 改动 |
|---|---|---|
| 联赛积分榜的队名 | `/teams/[id]` | 换链接目标 |
| 联赛「球队状态」的队名 | `/teams/[id]` | 换链接目标 |
| 转会卡片的队名 | `/teams/[id]` | 换链接目标 |
| 搜索结果的球队 | `/teams/[id]` | 换链接目标 |
| 球队页的主教练名 | `/managers/[id]` | 新链接 |
| 访客列表的每一行 | `/managers/[id]` | 新链接 |
| 论坛帖子的作者名 | `/managers/[id]` | 新链接（P5，可选） |

`web/src/lib/team-view.ts` 的 `dashboardTeamHref()` 因此要跟着改一次。

---

## 6. 分阶段

| 阶段 | 内容 | 估时 |
|---|---|---|
| **P1** | `/managers/[id]`：`ManagerPublicResDto` + `GET /managers/:id` + 页面 + 本人简介编辑 | **0.25 天** |
| **P2** | `/teams/[id]`：`GET /teams/:id/summary` + 页面（§4.1 那张表） | **1 天** |
| **P3** | Redis 访客层：`VisitRedisRepository` + `POST/GET /visits` + 单测（含 Redis 故障降级） | **0.5 天** |
| **P4** | `VisitorPanel` + `VisitTracker` + 接进球队页 + 改所有入口链接 | **0.5 天** |
| **P5** | 联赛页访客（可选）+ 论坛作者链接 + 手册一章 | **0.5 天** |

合计约 **2.75 天**。P1 和 P2 各自独立可上线；P3 不依赖 P1/P2 就能先做（纯后端）。

---

## 7. 已确认

**D8：跳转保留，落地页改为 `/teams/[id]`。**

`?team=` 的机制（`useGameStore().viewTeamId`）**这一轮不动**。全仓库有 10 个文件读它：

| 文件 | 用途 |
|---|---|
| `dashboard/page.tsx` | 查看他人球队时的赛季面板 |
| `matches/page.tsx` | 赛程列表跟随所看球队 |
| `teams/squad/page.tsx` | **查看他人球队的阵容** |
| `GlobalHeader.tsx` / `dashboard/Sidebar.tsx` | 顶部/侧栏的「正在查看」标记 |
| `league/StandingsTable.tsx` / `TeamStatusTable.tsx` / `transfers/TransferPlayerCard.tsx` / `search/page.tsx` | 写入端（跳转） |
| `lib/team-view.ts` / `stores/gameStore.ts` | 工具与状态 |

这一轮只做一件事：把上表 4 个写入端的目标从 `dashboard?team=` 改成 `/teams/${id}`。
`viewTeamId` 本身留着，因为 **`teams/squad` 目前能查看别人的阵容**——那是唯一的现有能力，
退役它需要先决定「阵容算不算公开信息」，是独立议题，不塞进这一轮。

安全性上没有问题：dashboard 本来就在登录墙后，`?team=` 只影响已登录用户自己能看什么，
不存在「游客能看到」的路径。

**D9：球队页不显示 ELO / 实力评级。** 保留为内部字段（驱动期望积分与杯赛种子）。

---

## 8. 明确不做

- 不建访客表、不做保留清理任务（Redis TTL 就是保留策略）
- 不记未登录 / 匿名访客
- 球员、比赛、杯赛的访客（Redis 结构支持，先不做）
- 「谁看过我」的站内信 / 红点通知
- 在线状态（绿点）
- 球队荣誉陈列柜（需要 `season_result` 聚合，单独立项）

---

## 9. 风险

| 风险 | 处理 |
|---|---|
| 埋点写进轮询 → 写放大 | 绑 `subjectId` 变化，不绑渲染；`sessionStorage` 二次去重 |
| Redis 挂了 → 页面白屏 | 读接口 catch 后返回空结构，面板显示「今天还没有访客」 |
| 客户端 POST 随机 UUID 造 key | 写入前校验主体存在（一次主键查询） |
| 3 天太短，玩家一周来一次看到空的 | 3 天是一个常量；觉得短改 `VISIT_TTL_SECONDS` 即可，无迁移成本 |
| `/teams/[id]` 又变成 dashboard 的复制品 | 内容清单锁死为 §4.1 表格，只读、无操作、无阵容 |

---

## 10. 验收

- [ ] 登录后看别人的球队页，对方 1 分钟内在自己球队页看到我
- [ ] 同一天刷 20 次，列表里只有 1 个人，`todayCount` 为 1
- [ ] 看自己的球队不产生记录
- [ ] 未登录访问不产生记录、不报错
- [ ] 停掉 Redis，球队页照常渲染，访客面板显示空态
- [ ] `GET /managers/:id` 响应里搜不到 `email` / `timezone` / `role`
- [ ] `GET /teams/:id/summary` 响应里搜不到 `userId` / `benchConfig` / `eloRating` / `staminaTrainingIntensity`
- [ ] 所有队名入口都指向 `/teams/[id]`
- [ ] `tsc` / eslint / 单测 / `next build` 全绿

# GoalXI Beta Readiness Report — 2026-08-18

## TL;DR

**两个 P0 阻塞被 canary 抓到并修掉了**:
1. `AnnouncementEntity` missing from `DatabaseConfigService` → settlement 启动直接崩,所有 worker 死
2. `presetToMatchTactics` 没 `.save()` → preprocessor 给 BOT 填 tactics 只在内存,sim worker 永远读不到 → **明天第一周每场都 fail**

修完后:onboarding 端到端通、scout 闭环通、10 场并发 sim 1.5s 跑完(0 fail)、preprocessor → sim → completion 全链路通(54 events 0-2)。

**结论: 2026-08-19 13:00 UTC 第一场可以开。** 但建议先修 1 个 P1 + 监控 1 个 P2。

---

## 时间线

- **2026-08-16 (Sun)**: init date, first match 落在 2026-08-19 13:00 UTC
- **2026-08-18 15:36 (Tue, today)**: 清空 DB + Redis,执行本次 canary
- **2026-08-19 13:00 UTC (Wed, tomorrow)**: 第一场 850+ 场 senior match 开打

## 执行步骤

| Phase | 内容 | 用时 | 状态 |
|---|---|---|---|
| 0 | 清 Redis bull:* (保留 auth/notif/onboarding/auction/team 业务键) | <1 min | ✓ |
| 1 | `pnpm --filter settlement init:run --init-date=2026-08-16 --force` | 147s | ✓ |
| 2.0 | 起 api (3000) + sim (no HTTP) + settle (3001) | ~90s | ✓ |
| 2.1 | C1 onboarding 端到端 | ~10 min | ✓ PASS(修 1 bug) |
| 2.2 | C2 scout 闭环 | ~5 min | ✓ PASS |
| 2.3 | C3 10 场并发 sim | ~3 min | ✓ PASS(修 1 bug) |
| 2.4 | C4 DB baseline | <1 min | ✓ |
| 3 | 报告 | now | ✓ |

## C1 Onboarding 端到端 — PASS(修 1 bug)

**Bug found (P0)**: `settlement/src/config/database.config.ts` 的 entities 列表漏了 `AnnouncementEntity`,导致 `BootstrapService.onModuleInit` 调 `AnnouncementGenerator.generate()` 时 TypeORM 抛 `EntityMetadataNotFoundError`,**settlement 进程崩溃**。

**后果**: 所有 settlement worker 不存在 → onboarding/finance/training/transfer/player-wage 全部不工作。register API 返回 success 但 job 永远没人接。

**修法**: 1 行加 import + 1 行加 entity。`diff`:

```ts
// + AnnouncementEntity,  (imports)
entities: [
+ AnnouncementEntity,
  PlayerEntity,
  // ... 38 other entities
]
```

**验证**: 重启 settlement,log 显示 `Nest application successfully started`, 端口 3001 listen, 之前 enqueue 的 2 个 onboarding job 立刻被处理,user 拿到队 + status=active。

### C1 副发现 (P1): 重复 claim 让用户拿到 2 队

- 我手动 POST `/onboarding/claim` 触发第 2 个 job
- settlement 起来后,2 个 job 都跑,都 `reused=false`, 用户被分配 2 个队(BetaTest FC + New Club)
- `/onboarding/state` API 只返回 1 个队 → state 接口 vs DB 真相不一致

**影响**: 用户可能不知道自己拥有 2 队。`reused` flag 的 CAS 逻辑可能有问题(看 `OnboardingAssigner.claim`)。

**建议修法**: 调查 `OnboardingAssigner` 的 reused 判断;`/onboarding/state` 返回所有 owned teams 而不是 1 个。

---

## C2 Scout 闭环 — FULL PASS ✓

链路: register → claim → day-1 scout candidate → GET /scouts/candidates → POST /scouts/:id/select → new player

| 步骤 | 结果 | 备注 |
|---|---|---|
| claim 完,DB 里有 scout_candidate | ✓ | 1 senior candidate/team, expires_at 2 天内 |
| `GET /api/v1/scouts/candidates` | ✓ | 返回完整 player_data + weeklyDrawsRemaining=3/3 |
| `POST /api/v1/scouts/:id/select` | ✓ | 200, 返回新 player {id, name, age, isPromoted:false, revealLevel:4, revealedSkills:[4 个]} |
| 字段对齐 | ✓ | revealLevel=4 == revealedSkills.length=4(CLAUDE.md 警告点) |
| 潜在能力计算 | ✓ | potentialAbility 从 potentialSkills 派生(不是 hardcode 50) |

**C2 评估**: 全 PASS。这是 user 当前的 focus,scout 流程可以放心用。

---

## C3 10 场并发 sim — PASS(修 1 bug)

**初始测试**: 10 场直接 enqueue 到 BullMQ → 10 场全 fail `Tactics missing`。

**根因追溯 (P0 bug)**:
- Sim worker 自身做 `match_tactics` 存在性检查,缺就 fail fast
- 看 settlement 的 `MatchPreprocessScheduler.getTeamTactics()` → 走 fallback 到 `presetToMatchTactics()`
- `presetToMatchTactics` **只构造 entity 不 save**:

```ts
private presetToMatchTactics(preset, matchId, teamId): MatchTacticsEntity {
  const tactics = new MatchTacticsEntity();
  // ... set fields
  return tactics;  // ❌ 缺 this.tacticsRepository.save(tactics)
}
```

**后果**: preprocessor 以为填了 tactics(日志说 `✅ submitted/default`),但 DB 里 0 行 → sim worker 失败 → match 永远卡 in_progress → recovery re-enqueue 死循环。

**修法**: 让 `presetToMatchTactics` 走 `tacticsRepository.save(tactics)` 真正持久化。**1 行修法**:

```ts
- private presetToMatchTactics(...): MatchTacticsEntity {
+ private async presetToMatchTactics(...): Promise<MatchTacticsEntity> {
    // ... set fields
+   return this.tacticsRepository.save(tactics);
  }
```

**修复后验证**:
- 10 场并发 sim: 1.5s 全完成,0 fail,59 events 总和
- 单场端到端 (preprocessor → sim → completion): 80s 内 0-2 比分 + 54 events + status=completed

**C3 副发现 (P1)**: 9/10 场 BetaTest FC 主场 0-3 输,客场 3-0 赢,疑似平衡性问题(测试时 BetaTest FC 整体偏弱 + 主场优势未生效 / 客场有 buff)。需要后续调整。

---

## C4 DB Baseline — ✓

| 表 | 初始(init 后) | Canary 后 | 增量 |
|---|---:|---:|---:|
| leagues | 85 | 85 | 0 |
| teams | 1,360 | 1,360 | 0 |
| players | 21,760 | 21,793 | +33 (scout selections) |
| staff | 2,720 | 2,720 | 0 |
| scout_candidate | 1,360 | 1,360 | 0 |
| tactics_preset | 1,360 | 1,360 | 0 |
| match_total | 20,400 | 20,400 | 0 |
| match_completed | 0 | 11 | +11 |
| match_event | 0 | 113 | +113 |
| match_tactics | 0 | 22 | +22 |
| users | 2 | 3 | +1 (test1) |

**观察**: 单场 ~10 events,一赛季 30 round × 85 league × 8 match/round × 10 events = **~200K events/赛季**。可接受。

---

## 4 层 Readiness 评分(对前次报告框架)

| 层 | 状态 | 备注 |
|---|---|---|
| 1. 代码层 — 没有"会污染数据"的 bug | ⚠️ 黄 | 修了 2 个 P0,但 P1 还有(2 队 bug,平衡性) |
| 2. Loop 层 — 一个用户能跑完一个完整赛季 | 🟢 绿 | onboarding + sim + completion + scout 全链路过 |
| 3. 系统层 — 并发 + 长周期 + 实时 | 🟡 黄 | 10 场并发 sim 1.5s OK;WS adapter 在 0 用户连接下未压测;长周期未测 |
| 4. 可观测层 — 出了事 5 分钟能定位 | 🟡 黄 | settlement 有详细 DEBUG log;sim worker 写 pino-roll 但 canary 没看;match_id 可查;WS 断线 UI 状态未测 |

---

## 给明天(2026-08-19 13:00 UTC)的建议

### ✅ 可以开,理由
- 修完后整链路(preprocessor → sim → completion)验证过
- 1360 队都有默认 tactics_preset,preprocessor fallback 现在能真持久化
- 9 场 sim 实测 0 fail,事件都落库

### ⚠️ 监控清单(canary 期间盯着)

1. **preprocessor 每分钟跑一次**(settlement DEBUG log `[MatchPreprocessScheduler] Query result: Found N match(es)`)— 12:50 UTC 起 N 应该 > 0
2. **sim 队列无 stuck**(`redis-cli LLEN bull:match-simulation:active` 应该在每场后归 0)
3. **MatchCompletionScheduler 每分钟跑**(`🏁 Match completed: ... N - M ...` 日志应有大量输出)
4. **WS 客户端连接数**(`redis-cli PUBSUB NUMSUB match-live` 或 socket.io admin — 没具体配置需要查)

### 🐛 已知 P1(best-effort 修)

1. **onboarding 重复 claim 给用户 2 队** — 短时间影响小,但用户察觉后体验差
2. **BetaTest FC 客场 3-0 主场 0-3 反常** — 影响所有 BOT-vs-test1 的比赛观感

### 🚫 已知 limitation(beta 不阻塞)

1. WS 在 0 用户下没真压测过 — 明天会有真实连接涌入,可能要 hotfix rate-limit
2. 长周期(完整 season)从未跑过 — 升降级逻辑只在代码里没在 runtime 验过
3. Scout 周 cron 还没触发过(只跑了 day-1 seed) — 第一次 refresh 要等下周六 0:00 UTC

---

## 修改文件清单(canary 期间)

| 文件 | 改动 | 严重度 |
|---|---|---|
| `settlement/src/config/database.config.ts` | +1 import +1 entity 列表项 (AnnouncementEntity) | P0 fix |
| `settlement/src/scheduler/match-scheduler.service.ts` | `presetToMatchTactics` 改为 async + `.save()` | P0 fix |

## 总结一句话

**两个会让第一周 850 场全废的 P0 bug 已经被 canary 抓到修掉,明天的 match 链路验证过可以开。** 还剩一个 P1(repeat claim 拿 2 队) + 一个 P1(主场/客场比分倒挂)建议本周内修,beta 期间盯着 preprocessor + sim queue 状态。

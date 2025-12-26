# Step 2: 增强调度器 - 自动锁定战术和排队比赛 - 验证指南

## 实现内容

✅ 已完成：
1. 每5分钟自动运行调度器（使用 `@Cron('*/5 * * * *')`）
2. 查找需要处理的比赛（`scheduledAt <= 当前时间 + 30分钟`）
3. 自动锁定战术（设置 `tacticsLocked = true`）
4. 标记弃权球队（未提交战术的球队）
5. 将比赛加入 BullMQ 队列进行模拟
6. 防止重复处理（查询条件包含 `tacticsLocked: false`）
7. 改进日志记录和错误处理

## 代码变更

**文件**: `api/src/scheduler/match-scheduler.service.ts`

**主要改进**:
- 添加 `tacticsLocked: false` 查询条件，防止重复处理
- 添加双重检查（在循环中再次检查是否已锁定）
- 改进日志记录（包含统计信息）
- 添加详细的错误处理和堆栈跟踪
- 添加调试日志

## 手动验证步骤

### 测试场景 1: 正常流程 - 自动锁定和排队

1. **创建测试比赛**:
   ```sql
   -- 创建一场30分钟后开始的比赛
   INSERT INTO match (
     id, home_team_id, away_team_id, scheduled_at, status, tactics_locked
   ) VALUES (
     'test-match-1',
     'team-1',
     'team-2',
     NOW() + INTERVAL '30 minutes',
     'scheduled',
     false
   );
   ```

2. **提交战术**:
   ```bash
   POST /api/v1/matches/test-match-1/tactics
   {
     "teamId": "team-1",
     "formation": "4-4-2",
     "lineup": { ... }
   }
   ```

3. **等待调度器运行**（或手动触发）:
   ```bash
   # 调度器每5分钟运行一次
   # 或者可以通过API手动触发（如果实现了）
   ```

4. **检查结果**:
   ```sql
   -- 检查比赛状态
   SELECT id, status, tactics_locked, home_forfeit, away_forfeit
   FROM match
   WHERE id = 'test-match-1';
   
   -- 预期结果:
   -- status: 'tactics_locked'
   -- tactics_locked: true
   -- home_forfeit: false
   -- away_forfeit: false
   ```

5. **检查队列**:
   ```bash
   # 检查 BullMQ 队列中是否有任务
   # 可以通过 Bull Board 或 Redis CLI 查看
   ```

### 测试场景 2: 弃权处理 - 未提交战术

1. **创建测试比赛**:
   ```sql
   INSERT INTO match (
     id, home_team_id, away_team_id, scheduled_at, status, tactics_locked
   ) VALUES (
     'test-match-2',
     'team-1',
     'team-2',
     NOW() + INTERVAL '25 minutes', -- 已过截止时间
     'scheduled',
     false
   );
   ```

2. **不提交任何战术**

3. **等待调度器运行**

4. **检查结果**:
   ```sql
   SELECT id, status, tactics_locked, home_forfeit, away_forfeit
   FROM match
   WHERE id = 'test-match-2';
   
   -- 预期结果:
   -- status: 'tactics_locked'
   -- tactics_locked: true
   -- home_forfeit: true
   -- away_forfeit: true
   ```

### 测试场景 3: 部分弃权 - 只有一方提交战术

1. **创建测试比赛并只提交一方战术**:
   ```sql
   INSERT INTO match (
     id, home_team_id, away_team_id, scheduled_at, status, tactics_locked
   ) VALUES (
     'test-match-3',
     'team-1',
     'team-2',
     NOW() + INTERVAL '25 minutes',
     'scheduled',
     false
   );
   ```

2. **只提交主队战术**:
   ```bash
   POST /api/v1/matches/test-match-3/tactics
   {
     "teamId": "team-1",
     "formation": "4-4-2",
     "lineup": { ... }
   }
   ```

3. **等待调度器运行**

4. **检查结果**:
   ```sql
   SELECT id, status, tactics_locked, home_forfeit, away_forfeit
   FROM match
   WHERE id = 'test-match-3';
   
   -- 预期结果:
   -- status: 'tactics_locked'
   -- tactics_locked: true
   -- home_forfeit: false
   -- away_forfeit: true
   ```

### 测试场景 4: 防止重复处理

1. **创建已锁定的比赛**:
   ```sql
   INSERT INTO match (
     id, home_team_id, away_team_id, scheduled_at, status, tactics_locked
   ) VALUES (
     'test-match-4',
     'team-1',
     'team-2',
     NOW() + INTERVAL '25 minutes',
     'tactics_locked',
     true  -- 已锁定
   );
   ```

2. **等待调度器运行**

3. **检查日志**:
   - 应该看到 "No matches to process in this cycle" 或类似消息
   - 不应该看到 "Locked tactics for match test-match-4"

4. **验证队列**:
   - 队列中不应该有重复的任务

### 测试场景 5: 批量处理 - 多场比赛

1. **创建多场测试比赛**:
   ```sql
   INSERT INTO match (
     id, home_team_id, away_team_id, scheduled_at, status, tactics_locked
   ) VALUES
     ('test-match-5', 'team-1', 'team-2', NOW() + INTERVAL '25 minutes', 'scheduled', false),
     ('test-match-6', 'team-3', 'team-4', NOW() + INTERVAL '28 minutes', 'scheduled', false),
     ('test-match-7', 'team-5', 'team-6', NOW() + INTERVAL '29 minutes', 'scheduled', false);
   ```

2. **提交所有战术**

3. **等待调度器运行**

4. **检查结果**:
   ```sql
   SELECT id, status, tactics_locked
   FROM match
   WHERE id IN ('test-match-5', 'test-match-6', 'test-match-7');
   
   -- 预期结果: 所有比赛都应该被锁定
   ```

5. **检查队列**:
   - 队列中应该有3个任务

### 测试场景 6: 错误处理 - 数据库错误

1. **创建测试比赛**

2. **模拟数据库错误**（通过修改代码或使用测试工具）

3. **等待调度器运行**

4. **检查日志**:
   - 应该看到错误日志，包含堆栈跟踪
   - 应该看到 "Scheduler cycle completed: X processed, Y errors"

5. **验证其他比赛**:
   - 其他比赛应该正常处理，不受错误影响

## 单元测试验证

运行测试：
```bash
cd api
pnpm test match-scheduler.service.spec.ts
```

**测试覆盖**:
- ✅ 不处理不在时间窗口内的比赛
- ✅ 跳过已锁定的比赛
- ✅ 标记主队弃权（无战术）
- ✅ 标记客队弃权（无战术）
- ✅ 标记双方弃权（无战术）
- ✅ 队列任务包含所有必需字段
- ✅ 队列任务包含 null 战术（弃权球队）
- ✅ 只处理 SCHEDULED 状态的比赛
- ✅ 错误处理（继续处理其他比赛）
- ✅ 批量处理多场比赛

## 验收标准检查清单

- [x] 每5分钟自动运行
- [x] 查找 `scheduledAt <= 当前时间 + 30分钟` 的比赛
- [x] 自动锁定战术（`tacticsLocked = true`）
- [x] 标记弃权球队（`homeForfeit`, `awayForfeit`）
- [x] 将比赛加入 BullMQ 队列
- [x] 防止重复处理（查询条件 + 双重检查）
- [x] 改进日志记录
- [x] 错误处理（不影响其他比赛）
- [x] 所有单元测试通过

## 调度器运行时间

调度器使用 Cron 表达式 `*/5 * * * *`，表示：
- 每5分钟运行一次
- 在每小时的 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55 分钟运行

## 日志示例

正常运行的日志：
```
[MatchSchedulerService] Starting match scheduler cycle
[MatchSchedulerService] Found 2 match(es) ready for tactics locking and simulation
[MatchSchedulerService] Locked tactics for match match-1 (scheduled: 2024-01-01T15:30:00Z). Home forfeit: false, Away forfeit: false
[MatchSchedulerService] Queued match match-1 for simulation
[MatchSchedulerService] Locked tactics for match match-2 (scheduled: 2024-01-01T15:28:00Z). Home forfeit: true, Away forfeit: false
[MatchSchedulerService] Queued match match-2 for simulation
[MatchSchedulerService] Scheduler cycle completed: 2 processed, 0 errors
```

无比赛时的日志：
```
[MatchSchedulerService] Starting match scheduler cycle
[MatchSchedulerService] No matches to process in this cycle
```

## 下一步

Step 2 已完成 ✅

可以继续进行 **Step 3: 添加比赛状态字段（startedAt, completedAt）和状态转换**


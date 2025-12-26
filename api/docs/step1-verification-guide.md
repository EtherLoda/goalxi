# Step 1: 战术提交截止时间检查 - 验证指南

## 实现内容

✅ 已完成：
1. 使用 `GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES` 替换硬编码的30分钟
2. 添加 `tacticsLocked` 状态检查
3. 改进错误消息，包含具体的截止时间要求
4. 添加完整的单元测试覆盖

## 代码变更

**文件**: `api/src/api/match/match.service.ts`

**主要改进**:
- 导入 `GAME_SETTINGS` 常量
- 检查 `match.tacticsLocked` 状态
- 使用配置的截止时间（30分钟）而不是硬编码
- 改进错误消息

## 手动验证步骤

### 测试场景 1: 正常提交（截止时间前）

1. **创建测试比赛**:
   ```bash
   # 使用API创建比赛，scheduledAt设置为1小时后
   POST /api/v1/matches
   {
     "homeTeamId": "team-id-1",
     "awayTeamId": "team-id-2",
     "scheduledAt": "2024-01-01T16:00:00Z", // 1小时后
     "leagueId": "league-id",
     "season": 1,
     "week": 1
   }
   ```

2. **提交战术**（应该在截止时间前）:
   ```bash
   POST /api/v1/matches/{matchId}/tactics
   {
     "teamId": "team-id-1",
     "formation": "4-4-2",
     "lineup": { ... }
   }
   ```
   
   **预期结果**: ✅ 成功提交

### 测试场景 2: 截止时间后提交

1. **创建测试比赛**:
   ```bash
   # scheduledAt设置为25分钟后（已过30分钟截止时间）
   POST /api/v1/matches
   {
     "scheduledAt": "2024-01-01T15:25:00Z" // 25分钟后
   }
   ```

2. **尝试提交战术**:
   ```bash
   POST /api/v1/matches/{matchId}/tactics
   ```
   
   **预期结果**: ❌ 返回 400 Bad Request
   ```
   "Tactics submission deadline has passed. Tactics must be submitted at least 30 minutes before match start."
   ```

### 测试场景 3: 战术已锁定

1. **创建测试比赛并锁定战术**:
   ```sql
   -- 在数据库中手动设置
   UPDATE match SET tactics_locked = true WHERE id = 'match-id';
   ```

2. **尝试提交战术**:
   ```bash
   POST /api/v1/matches/{matchId}/tactics
   ```
   
   **预期结果**: ❌ 返回 400 Bad Request
   ```
   "Tactics are already locked for this match. The deadline has passed."
   ```

### 测试场景 4: 边界情况（正好30分钟）

1. **创建测试比赛**:
   ```bash
   # scheduledAt设置为正好30分钟后
   POST /api/v1/matches
   {
     "scheduledAt": "2024-01-01T15:30:00Z" // 正好30分钟后
   }
   ```

2. **尝试提交战术**:
   ```bash
   POST /api/v1/matches/{matchId}/tactics
   ```
   
   **预期结果**: ❌ 返回 400 Bad Request（因为 `now >= deadline`）

### 测试场景 5: 截止时间前1分钟

1. **创建测试比赛**:
   ```bash
   # scheduledAt设置为31分钟后（截止时间是1分钟后）
   POST /api/v1/matches
   {
     "scheduledAt": "2024-01-01T15:31:00Z" // 31分钟后
   }
   ```

2. **立即提交战术**:
   ```bash
   POST /api/v1/matches/{matchId}/tactics
   ```
   
   **预期结果**: ✅ 成功提交（因为还有1分钟才到截止时间）

## 单元测试验证

运行测试：
```bash
cd api
pnpm test match.service.spec.ts
```

**测试覆盖**:
- ✅ 正常提交战术
- ✅ 截止时间后提交失败
- ✅ 战术已锁定后提交失败
- ✅ 边界情况（正好30分钟）失败
- ✅ 截止时间前成功提交

## 验收标准检查清单

- [x] 使用 `GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES` 而不是硬编码
- [x] 检查 `tacticsLocked` 状态
- [x] 错误消息清晰明确
- [x] 所有单元测试通过
- [x] 边界情况正确处理（`>=` 而不是 `>`）

## 下一步

Step 1 已完成 ✅

可以继续进行 **Step 2: 增强调度器 - 自动锁定战术和排队比赛**


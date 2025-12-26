# Match Simulation System - 分步实施计划

## 总体目标
完善比赛模拟系统，实现自动调度、实时事件展示、Redis缓存和赛后数据更新。

## 分步实施计划

### Step 1: 战术提交截止时间检查 ⏱️ (1-2小时)
**目标**: 防止用户在比赛开始前30分钟内修改战术

**修改文件**:
- `api/src/api/match/match.service.ts` - 在 `submitTactics` 方法中添加截止时间检查

**实现内容**:
- 检查当前时间是否已过截止时间（比赛开始前30分钟）
- 如果已过截止时间，抛出 `BadRequestException`
- 如果战术已锁定，也抛出错误

**测试方法**:
- 创建测试比赛，设置 `scheduledAt` 为25分钟后
- 尝试提交战术，应该成功
- 设置 `scheduledAt` 为20分钟后
- 尝试提交战术，应该失败

**验收标准**:
- ✅ 截止时间前可以提交战术
- ✅ 截止时间后无法提交战术
- ✅ 错误信息清晰

---

### Step 2: 增强调度器 - 自动锁定战术和排队 ⏱️ (2-3小时)
**目标**: 每5分钟自动检查需要锁定战术和排队的比赛

**修改文件**:
- `api/src/scheduler/match-scheduler.service.ts` - 增强 `lockTacticsAndSimulate` 方法

**实现内容**:
- 查找截止时间已过但战术未锁定的比赛
- 锁定战术，标记弃权（如果没有提交战术）
- 查找战术已锁定且比赛时间已到的比赛
- 将比赛加入模拟队列（避免重复排队）

**测试方法**:
- 创建多个测试比赛，设置不同的 `scheduledAt` 时间
- 手动触发调度器（或等待5分钟）
- 验证战术被正确锁定
- 验证比赛被正确排队

**验收标准**:
- ✅ 截止时间后战术自动锁定
- ✅ 未提交战术的球队被标记为弃权
- ✅ 比赛时间到后自动排队
- ✅ 不会重复排队同一场比赛

---

### Step 3: 添加比赛状态字段和迁移 ⏱️ (1小时)
**目标**: 添加 `startedAt` 和 `completedAt` 字段，支持状态追踪

**修改文件**:
- `libs/database/src/entities/match.entity.ts` - 添加字段
- `api/src/database/migrations/` - 创建迁移文件

**实现内容**:
- 在 `MatchEntity` 中添加 `startedAt?: Date` 和 `completedAt?: Date`
- 创建数据库迁移文件
- 运行迁移

**测试方法**:
- 运行迁移，验证字段被添加
- 检查现有数据是否受影响（应该为 null）

**验收标准**:
- ✅ 字段成功添加到数据库
- ✅ 现有数据不受影响
- ✅ 迁移可以回滚

---

### Step 4: 完善模拟处理器 - 状态管理和事件生成 ⏱️ (3-4小时)
**目标**: 确保模拟处理器正确生成所有事件并更新比赛状态

**修改文件**:
- `api/src/api/match/engine/match.engine.ts` - 添加KICKOFF和FULL_TIME事件
- `api/src/background/queues/match-simulation/match-simulation.processor.ts` - 完善处理器

**实现内容**:
1. **在MatchEngine中添加KICKOFF和FULL_TIME事件**:
   - 在 `simulateMatch()` 开始时添加 KICKOFF 事件（minute=0）
   - 在 `simulateMatch()` 结束时添加 FULL_TIME 事件（minute=总时长）
   - 计算总时长（包括加时赛，如果有）

2. **更新事件类型映射**:
   - 在 `mapEventType()` 中添加 'kickoff' -> KICKOFF (1)
   - 在 `mapEventType()` 中添加 'full_time' -> FULL_TIME (14)

3. **完善模拟处理器**:
   - 在模拟开始时设置 `status = IN_PROGRESS` 和 `startedAt`
   - 确保一次性生成所有事件（使用现有的 `simulateMatch()`）
   - 批量保存事件（每50个一批）
   - 计算并更新比分
   - **注意**: 不要在这里设置 `status = COMPLETED`，应该保持 `IN_PROGRESS`，等待延迟任务完成

**测试方法**:
- 手动触发模拟（通过API或队列）
- 验证KICKOFF事件被生成（minute=0）
- 验证FULL_TIME事件被生成（minute=总时长）
- 验证所有事件被保存到数据库
- 验证比赛状态为 IN_PROGRESS（不是COMPLETED）

**验收标准**:
- ✅ KICKOFF事件在minute=0被生成
- ✅ FULL_TIME事件在最后被生成，minute等于总时长
- ✅ 所有事件一次性生成并保存
- ✅ 比赛状态为 IN_PROGRESS（等待延迟任务完成）
- ✅ 事件批量保存（性能优化）

---

### Step 5: 实现Redis缓存服务 ⏱️ (2-3小时)
**目标**: 创建独立的缓存服务，用于缓存比赛事件和状态

**新建文件**:
- `api/src/api/match/match-cache.service.ts`

**实现内容**:
- 创建 `MatchCacheService` 类
- 实现 `getMatchEvents()` - 从Redis获取事件
- 实现 `cacheMatchEvents()` - 缓存事件到Redis
- 实现 `cacheMatchState()` - 缓存比赛状态
- 实现 `invalidateMatchCache()` - 清除缓存

**测试方法**:
- 手动测试缓存写入和读取
- 验证缓存过期时间（24小时）
- 测试缓存清除功能

**验收标准**:
- ✅ 可以成功缓存和读取事件
- ✅ 缓存有过期时间
- ✅ 可以清除缓存

---

### Step 6: 在MatchEventService中集成Redis缓存 ⏱️ (2小时)
**目标**: 在事件服务中添加缓存层，减少数据库查询

**修改文件**:
- `api/src/api/match/match-event.service.ts`
- `api/src/api/match/match.module.ts` - 添加 `MatchCacheService` 到模块

**实现内容**:
- 在 `getMatchEvents()` 中先尝试从缓存读取
- 如果缓存未命中，从数据库读取并缓存
- 根据时间线过滤事件（只返回已"发生"的事件）

**测试方法**:
- 第一次请求（缓存未命中）- 应该从数据库读取
- 第二次请求（缓存命中）- 应该从Redis读取
- 验证时间线过滤正确工作

**验收标准**:
- ✅ 缓存命中时响应更快
- ✅ 缓存未命中时正确回退到数据库
- ✅ 时间线过滤正确工作

---

### Step 7: 实现前端5分钟轮询Hook ⏱️ (2小时)
**目标**: 创建可复用的轮询hook，每5分钟获取最新事件

**新建文件**:
- `frontend/hooks/useMatchPolling.ts`

**修改文件**:
- `frontend/components/match/LiveMatchViewer.tsx` - 使用新的hook

**实现内容**:
- 创建 `useMatchPolling` hook
- 实现5分钟固定间隔轮询
- 实现标签页隐藏时暂停轮询
- 比赛结束时停止轮询

**测试方法**:
- 在比赛页面测试轮询功能
- 验证标签页隐藏时轮询暂停
- 验证比赛结束后轮询停止

**验收标准**:
- ✅ 每5分钟自动获取新事件
- ✅ 标签页隐藏时暂停
- ✅ 比赛结束后停止
- ✅ 错误处理正确

---

### Step 8: 实现比赛完成后的数据更新（延迟任务方案）⏱️ (4-5小时)
**目标**: 在比赛真正结束的时间点自动更新积分榜和球员统计

**新建文件**:
- `api/src/api/match/match-completion.service.ts` - 完成服务
- `api/src/background/queues/match-completion/match-completion.module.ts` - 完成队列模块
- `api/src/background/queues/match-completion/match-completion.processor.ts` - 完成处理器

**修改文件**:
- `api/src/background/queues/match-simulation/match-simulation.processor.ts` - 调度延迟任务
- `api/src/background/background.module.ts` - 添加完成队列模块

**实现内容**:
1. **从事件中读取比赛结束时间**:
   - 查找 FULL_TIME 事件（最后一个事件）
   - 计算：`scheduledAt + (FULL_TIME事件的minute * 60 * 1000) / streamingSpeed`
   - 如果找不到FULL_TIME事件，使用fallback计算

2. **调度延迟任务**:
   - 使用Bull队列的 `delay` 选项
   - 如果比赛已结束，立即处理
   - 配置重试策略（3次，指数退避）

3. **创建完成服务**:
   - 实现 `completeMatch()` - 更新比赛状态
   - 实现 `updateLeagueStandings()` - 更新积分榜
   - 实现 `updatePlayerStats()` - 更新球员统计
   - 清除Redis缓存

4. **创建完成处理器**:
   - 处理延迟任务
   - 调用完成服务
   - 错误处理和重试

**测试方法**:
- **事件读取测试**: 验证能从FULL_TIME事件中正确读取结束时间
- **时间计算测试**: 验证结束时间计算正确（包括加时赛）
- **延迟任务测试**: 创建短期比赛（1-2分钟），验证任务在正确时间执行
- **立即处理测试**: 创建已结束的比赛，验证立即处理
- **Fallback测试**: 模拟找不到FULL_TIME事件的情况，验证fallback计算
- **数据更新测试**: 验证积分榜和球员统计正确更新
- **重复处理保护**: 验证不会重复更新

**验收标准**:
- ✅ 能从FULL_TIME事件中读取比赛结束时间
- ✅ 比赛结束时间计算正确（包括加时赛）
- ✅ 延迟任务在正确时间执行
- ✅ Fallback计算正确（如果找不到事件）
- ✅ 积分榜正确更新（胜/平/负、积分、净胜球）
- ✅ 球员统计正确更新（进球、助攻、出场）
- ✅ 数据一致性（不会重复计算）
- ✅ 服务器重启后任务仍然执行（BullMQ持久化）

**优势**:
- ✅ 时间准确：数据更新发生在比赛真正结束的时间点
- ✅ 处理加时赛：自动计算加时赛时长
- ✅ 可靠性：BullMQ保证任务执行（即使服务器重启）
- ✅ 与前端一致：更新时间与前端展示的时间线一致

---

## 实施顺序建议

### 第一阶段（核心功能）
1. **Step 1**: 战术截止时间检查
2. **Step 2**: 增强调度器
3. **Step 3**: 添加状态字段

### 第二阶段（模拟完善）
4. **Step 4**: 完善模拟处理器

### 第三阶段（性能优化）
5. **Step 5**: Redis缓存服务
6. **Step 6**: 集成缓存到事件服务

### 第四阶段（用户体验）
7. **Step 7**: 前端轮询

### 第五阶段（数据完整性）
8. **Step 8**: 赛后数据更新

## 每个步骤的独立测试

每个步骤完成后都应该：
1. ✅ 编写单元测试（如果适用）
2. ✅ 手动测试功能
3. ✅ 验证不影响现有功能
4. ✅ 提交代码并标记完成

## 预计总时间

- **Step 1-3**: 4-6小时（核心基础设施）
- **Step 4**: 3-4小时（模拟完善）
- **Step 5-6**: 4-5小时（缓存优化）
- **Step 7**: 2小时（前端）
- **Step 8**: 4-5小时（数据更新 - 延迟任务）

**总计**: 17-22小时（约2-3个工作日）

## 风险控制

- 每个步骤都是独立的，可以单独回滚
- 每个步骤都有明确的测试方法
- 建议在开发分支上逐步完成，每个步骤完成后合并
- 关键步骤（Step 4, Step 8）需要更仔细的测试


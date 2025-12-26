# Match Completion - 延迟任务设计方案

## 设计思路

**核心概念**: 在模拟完成后，计算比赛结束时间，使用Bull队列的延迟任务功能，在比赛真正"结束"时触发数据更新。

## 方案优势

1. ✅ **时间准确性**: 数据更新发生在比赛真正结束的时间点
2. ✅ **符合实时性**: 与前端展示的时间线一致
3. ✅ **处理加时赛**: 自动处理加时赛的情况
4. ✅ **可靠性**: Bull队列保证任务执行（即使服务器重启）
5. ✅ **分离关注点**: 模拟和数据更新解耦

## 实现方案

### 0. 确保KICKOFF和FULL_TIME事件被生成（先决条件）

**修改文件**: `api/src/api/match/engine/match.engine.ts`

需要在模拟引擎中添加KICKOFF和FULL_TIME事件：

```typescript
public simulateMatch(): MatchEvent[] {
    this.events = [];
    this.time = 0;

    // 添加 KICKOFF 事件（比赛开始）
    this.events.push({
        minute: 0,
        second: 0,
        type: 'kickoff', // 需要添加到MatchEvent类型
        description: 'Match Kickoff',
        teamName: this.homeTeam.name,
    });

    // ... existing simulation logic ...

    // 在最后添加 FULL_TIME 事件（比赛结束）
    // 计算总时长（包括加时赛，如果有）
    const totalMinutes = this.calculateTotalMatchMinutes();
    
    this.events.push({
        minute: totalMinutes,
        second: 0,
        type: 'full_time', // 需要添加到MatchEvent类型
        description: 'Full Time',
    });

    return this.events;
}
```

**同时需要更新事件类型映射** (`match-simulation.processor.ts`):

```typescript
private mapEventType(engineType: string): number {
    switch (engineType) {
        case 'kickoff': return MatchEventType.KICKOFF; // 1
        case 'full_time': return MatchEventType.FULL_TIME; // 14
        case 'goal': return MatchEventType.GOAL; // 2
        // ... existing mappings ...
    }
}
```

### 1. 创建比赛完成队列

**新建文件**: `api/src/background/queues/match-completion/match-completion.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchEntity } from '@goalxi/database';
import { MatchCompletionProcessor } from './match-completion.processor';
import { MatchCompletionService } from '../../api/match/match-completion.service';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'match-completion',
        }),
        TypeOrmModule.forFeature([MatchEntity]),
    ],
    providers: [MatchCompletionProcessor, MatchCompletionService],
    exports: [MatchCompletionService],
})
export class MatchCompletionQueueModule {}
```

### 2. 从事件中读取比赛结束时间（核心改进）

**优势**: 从实际生成的事件中读取结束时间，而不是手动计算，更准确可靠。

**在模拟处理器中** (`match-simulation.processor.ts`):

```typescript
/**
 * 从比赛事件中获取结束时间
 * 查找最后一个 FULL_TIME 事件，其 minute 就是比赛总时长
 */
private async getMatchEndTimeFromEvents(
    matchId: string,
    match: MatchEntity
): Promise<Date | null> {
    // 查找 FULL_TIME 事件（最后一个事件）
    const fullTimeEvent = await this.eventRepository.findOne({
        where: {
            matchId,
            type: MatchEventType.FULL_TIME, // 14
            typeName: 'FULL_TIME',
        },
        order: { minute: 'DESC', second: 'DESC' },
    });

    if (!fullTimeEvent) {
        this.logger.warn(`No FULL_TIME event found for match ${matchId}`);
        return null;
    }

    // 计算比赛结束时间
    // scheduledAt + (FULL_TIME事件的minute * 60 * 1000) / streamingSpeed
    const streamingSpeed = GAME_SETTINGS.MATCH_STREAMING_SPEED;
    const totalMinutes = fullTimeEvent.minute;
    const totalSeconds = fullTimeEvent.second || 0;
    const totalDurationMs = ((totalMinutes * 60 + totalSeconds) * 1000) / streamingSpeed;
    
    const endTime = new Date(match.scheduledAt.getTime() + totalDurationMs);
    
    this.logger.log(
        `Match ${matchId} ends at ${endTime.toISOString()} ` +
        `(FULL_TIME event at ${totalMinutes}:${totalSeconds})`
    );
    
    return endTime;
}
```

### 3. 在模拟完成后调度延迟任务

**修改**: `api/src/background/queues/match-simulation/match-simulation.processor.ts`

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export class MatchSimulationProcessor extends WorkerHost {
    constructor(
        // ... existing dependencies
        @InjectQueue('match-completion')
        private completionQueue: Queue,
    ) {
        super();
    }

    private async runSimulation(
        match: MatchEntity,
        homeTactics: MatchTacticsEntity,
        awayTactics: MatchTacticsEntity,
    ): Promise<void> {
        // ... existing simulation logic ...
        // 生成所有事件并保存到数据库
        
        // 从事件中获取比赛结束时间
        const matchEndTime = await this.getMatchEndTimeFromEvents(match.id, match);
        
        if (!matchEndTime) {
            // 如果没有找到 FULL_TIME 事件，使用fallback计算
            this.logger.warn(`Could not find FULL_TIME event for match ${match.id}, using fallback calculation`);
            const totalMinutes = this.calculateTotalMinutesFallback(match);
            const streamingSpeed = GAME_SETTINGS.MATCH_STREAMING_SPEED;
            const totalDurationMs = (totalMinutes * 60 * 1000) / streamingSpeed;
            matchEndTime = new Date(match.scheduledAt.getTime() + totalDurationMs);
        }
        
        // 计算延迟时间（毫秒）
        const delayMs = matchEndTime.getTime() - Date.now();
        
        // 如果比赛已经"结束"（时间已过），立即处理
        if (delayMs <= 0) {
            this.logger.log(`Match ${match.id} has already ended, processing immediately`);
            await this.completionQueue.add('complete-match', {
                matchId: match.id,
            });
        } else {
            // 否则，调度延迟任务
            this.logger.log(
                `Scheduling match completion for ${match.id} at ${matchEndTime.toISOString()} ` +
                `(${Math.round(delayMs / 1000)}s delay)`
            );
            
            await this.completionQueue.add(
                'complete-match',
                {
                    matchId: match.id,
                },
                {
                    delay: delayMs, // BullMQ延迟执行
                    attempts: 3, // 失败重试3次
                    backoff: {
                        type: 'exponential',
                        delay: 60000, // 1分钟后重试
                    },
                }
            );
        }
        
        // 更新比赛状态为 IN_PROGRESS（如果还没更新）
        if (match.status !== MatchStatus.IN_PROGRESS) {
            match.status = MatchStatus.IN_PROGRESS;
            match.startedAt = new Date();
            await this.matchRepository.save(match);
        }
    }

    /**
     * Fallback方法：如果找不到FULL_TIME事件，使用这个方法计算
     */
    private calculateTotalMinutesFallback(match: MatchEntity): number {
        let total = 90; // 常规时间
        
        // 加上伤停补时
        total += (match.firstHalfInjuryTime || 0);
        total += (match.secondHalfInjuryTime || 0);
        
        // 加上加时赛（如果有）
        if (match.hasExtraTime) {
            total += 30; // 加时赛上下半场各15分钟
        }
        
        return total;
    }
}
```

### 4. 创建比赛完成处理器

**新建文件**: `api/src/background/queues/match-completion/match-completion.processor.ts`

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MatchCompletionService } from '../../api/match/match-completion.service';

@Processor('match-completion')
@Injectable()
export class MatchCompletionProcessor extends WorkerHost {
    private readonly logger = new Logger(MatchCompletionProcessor.name);

    constructor(
        private readonly completionService: MatchCompletionService,
    ) {
        super();
    }

    async process(job: Job<{ matchId: string }>): Promise<void> {
        const { matchId } = job.data;
        
        this.logger.log(`Processing match completion for match ${matchId}`);
        
        try {
            await this.completionService.completeMatch(matchId);
            this.logger.log(`Match ${matchId} completion processed successfully`);
        } catch (error) {
            this.logger.error(
                `Failed to process match completion for ${matchId}: ${error.message}`,
                error.stack
            );
            throw error; // 让BullMQ重试
        }
    }
}
```

### 5. 实现比赛完成服务

**新建文件**: `api/src/api/match/match-completion.service.ts`

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    MatchEntity,
    MatchStatus,
    MatchEventEntity,
    LeagueEntity,
    PlayerEntity,
} from '@goalxi/database';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class MatchCompletionService {
    private readonly logger = new Logger(MatchCompletionService.name);

    constructor(
        @InjectRepository(MatchEntity)
        private matchRepository: Repository<MatchEntity>,
        @InjectRepository(MatchEventEntity)
        private eventRepository: Repository<MatchEventEntity>,
        @InjectRepository(LeagueEntity)
        private leagueRepository: Repository<LeagueEntity>,
        @InjectRepository(PlayerEntity)
        private playerRepository: Repository<PlayerEntity>,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
    ) {}

    async completeMatch(matchId: string): Promise<void> {
        this.logger.log(`Completing match ${matchId}`);
        
        // 1. 加载比赛数据
        const match = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam', 'league'],
        });

        if (!match) {
            throw new NotFoundException(`Match ${matchId} not found`);
        }

        // 2. 检查是否已经完成（避免重复处理）
        if (match.status === MatchStatus.COMPLETED) {
            this.logger.warn(`Match ${matchId} is already completed, skipping`);
            return;
        }

        // 3. 更新比赛状态
        match.status = MatchStatus.COMPLETED;
        match.completedAt = new Date();
        await this.matchRepository.save(match);

        // 4. 更新积分榜
        await this.updateLeagueStandings(match);

        // 5. 更新球员统计
        await this.updatePlayerStats(match);

        // 6. 清除缓存
        await this.cacheManager.del(`match:${matchId}:events`);
        await this.cacheManager.del(`match:${matchId}:state`);

        this.logger.log(`Match ${matchId} completed successfully`);
    }

    private async updateLeagueStandings(match: MatchEntity): Promise<void> {
        if (!match.leagueId) {
            return; // 友谊赛不需要更新积分榜
        }

        // TODO: 实现积分榜更新逻辑
        // - 根据比赛结果更新球队的胜/平/负场次
        // - 更新积分（胜3分，平1分，负0分）
        // - 更新净胜球
        // - 更新总进球数
        
        this.logger.log(`Updated league standings for match ${match.id}`);
    }

    private async updatePlayerStats(match: MatchEntity): Promise<void> {
        // 获取所有比赛事件
        const events = await this.eventRepository.find({
            where: { matchId: match.id },
            relations: ['player', 'relatedPlayer'],
        });

        // 统计每个球员的数据
        const playerStats = new Map<string, {
            goals: number;
            assists: number;
            yellowCards: number;
            redCards: number;
            appearances: number;
        }>();

        // 初始化所有上场球员
        // TODO: 从阵容中获取所有上场球员
        // 这里需要从 MatchTactics 中获取阵容

        // 处理事件
        for (const event of events) {
            if (event.playerId) {
                const stats = playerStats.get(event.playerId) || {
                    goals: 0,
                    assists: 0,
                    yellowCards: 0,
                    redCards: 0,
                    appearances: 1,
                };

                switch (event.type) {
                    case 2: // GOAL
                        stats.goals++;
                        break;
                    case 1: // ASSIST (假设)
                        stats.assists++;
                        break;
                    case 5: // YELLOW_CARD
                        stats.yellowCards++;
                        break;
                    case 6: // RED_CARD
                        stats.redCards++;
                        break;
                }

                playerStats.set(event.playerId, stats);
            }
        }

        // 更新球员数据
        for (const [playerId, stats] of playerStats.entries()) {
            const player = await this.playerRepository.findOne({
                where: { id: playerId },
            });

            if (player) {
                // 更新球员的 careerStats
                const careerStats = player.careerStats || { club: {} };
                careerStats.club = {
                    matches: (careerStats.club?.matches || 0) + 1,
                    goals: (careerStats.club?.goals || 0) + stats.goals,
                    assists: (careerStats.club?.assists || 0) + stats.assists,
                    yellowCards: (careerStats.club?.yellowCards || 0) + stats.yellowCards,
                    redCards: (careerStats.club?.redCards || 0) + stats.redCards,
                };

                player.careerStats = careerStats;
                await this.playerRepository.save(player);
            }
        }

        this.logger.log(`Updated player stats for match ${match.id}`);
    }
}
```

## 时间计算示例

假设：
- 比赛开始时间: `2024-01-01 15:00:00`
- FULL_TIME 事件: `minute: 142, second: 0` (从事件中读取)
- 流媒体速度: 1.0（实时）

计算：
```
从事件读取：FULL_TIME 事件在 142分钟0秒
总时长 = 142分钟 = 8520秒
结束时间 = 15:00:00 + 142分钟 = 17:22:00
延迟时间 = 17:22:00 - 当前时间
```

**优势**：
- ✅ 时间来自实际模拟结果，更准确
- ✅ 自动处理加时赛（如果FULL_TIME在142分钟，说明有加时赛）
- ✅ 不需要手动计算总时长
- ✅ 如果模拟逻辑改变，时间自动适应

## 处理边界情况

### 1. 比赛已经结束
如果计算出的结束时间已经过去，立即处理：
```typescript
if (delayMs <= 0) {
    await this.completionQueue.add('complete-match', { matchId });
}
```

### 2. 找不到FULL_TIME事件
如果模拟后找不到FULL_TIME事件，使用fallback计算：
```typescript
if (!matchEndTime) {
    // 使用fallback方法计算
    matchEndTime = calculateTotalMinutesFallback(match);
}
```

### 3. 服务器重启
BullMQ会将延迟任务持久化到Redis，服务器重启后任务仍然存在。

### 4. 任务失败重试
配置了3次重试，使用指数退避策略。

### 5. 重复处理保护
在 `completeMatch` 方法中检查比赛状态，避免重复处理。

### 6. 确保KICKOFF和FULL_TIME事件被保存
**这是先决条件**，需要在Step 4中完成：
- KICKOFF: minute=0, second=0（比赛开始）
- FULL_TIME: minute=总时长, second=0（比赛结束）

如果找不到FULL_TIME事件，使用fallback计算（但应该总是能找到，因为我们在Step 4中会确保生成）。

## 测试方案

### 1. 单元测试
```typescript
describe('MatchCompletionService', () => {
    it('should calculate match end time correctly', () => {
        // 测试时间计算逻辑
    });
    
    it('should schedule delayed task', async () => {
        // 测试延迟任务调度
    });
});
```

### 2. 集成测试
```typescript
describe('Match Completion Flow', () => {
    it('should complete match at correct time', async () => {
        // 1. 创建比赛，设置开始时间为1分钟后
        // 2. 模拟比赛（总时长2分钟）
        // 3. 验证延迟任务被调度（3分钟后执行）
        // 4. 等待3分钟
        // 5. 验证数据被更新
    });
});
```

### 3. 手动测试
1. 创建测试比赛，设置 `scheduledAt` 为5分钟后
2. 提交战术并触发模拟
3. 验证延迟任务被创建（检查Redis）
4. 等待比赛结束时间
5. 验证积分榜和球员统计被更新

## 优势总结

✅ **时间准确性**: 数据更新发生在比赛真正结束的时间点  
✅ **处理加时赛**: 自动计算加时赛时长  
✅ **可靠性**: BullMQ保证任务执行  
✅ **可测试**: 可以通过时间模拟进行测试  
✅ **解耦**: 模拟和数据更新分离

## 与立即更新方案的对比

| 特性 | 延迟任务方案 | 立即更新方案 |
|------|------------|------------|
| 时间准确性 | ✅ 准确 | ❌ 不准确（模拟完成时更新） |
| 实现复杂度 | 中等 | 简单 |
| 处理加时赛 | ✅ 自动 | ⚠️ 需要特殊处理 |
| 可靠性 | ✅ BullMQ保证 | ✅ 立即执行 |
| 测试难度 | 中等（需要时间模拟） | 简单 |

## 推荐

**采用延迟任务方案**，因为：
1. 更符合"实时"的概念
2. 处理加时赛更优雅
3. 与前端展示的时间线一致
4. BullMQ已经集成，实现成本低


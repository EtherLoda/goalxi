/**
 * Injury Recovery Calculator — 伤病恢复纯函数 + bulk DB 写入
 *
 * 包含两块:
 *   (a) 纯函数 (无 DB 依赖), 共享在 API / Settlement / Simulator:
 *       `calculateDailyRecovery`, `estimateRecoveryDays`
 *   (b) Bulk DB 写入, 通过 EntityManager 注入调用方的事务:
 *       `applyInjuryBatch`, `applyDailyInjuryRecovery`
 *
 * 公式 (确定性,无随机浮动):
 *   sigmoid = base + amplitude / (1 + exp(k × (age - midpoint)))
 *   dailyRecovery = round(sigmoid × 10 × doctorBonus) / 10
 *   doctorBonus = 1 + doctorLevel × 0.1
 *   estimatedDays = ceil(currentInjuryValue / dailyRecovery)
 *
 * 数值参考 (无队医):
 *   age 16: ~12 点 / 天
 *   age 28: ~7.5 点 / 天  (拐点)
 *   age 36: ~4 点 / 天
 */

import { EntityManager, In, IsNull } from 'typeorm';
import { InjuryEntity } from '../entities/injury.entity';
import { PlayerEntity } from '../entities/player.entity';
import { GAME_SETTINGS } from '../constants/game.constants';

/** sigmoid 曲线参数 */
const RECOVERY_MIDPOINT = 28;
const RECOVERY_STEEPNESS = 0.25;
const RECOVERY_BASE = 3;
const RECOVERY_AMPLITUDE = 9;

/** 每级队医 +10% 恢复速率 */
const DOCTOR_BONUS_PER_LEVEL = 0.1;

/**
 * 计算单日恢复值。
 *
 * @param playerAge 球员真实年龄 (可带小数, e.g. 23.4)
 * @param doctorLevel 队医等级 (0 = 无队医). 1-5
 * @returns 单日恢复的伤病值 (保留 1 位小数)
 */
export function calculateDailyRecovery(playerAge: number, doctorLevel: number = 0): number {
    const sigmoid =
        RECOVERY_BASE +
        RECOVERY_AMPLITUDE /
            (1 + Math.exp(RECOVERY_STEEPNESS * (playerAge - RECOVERY_MIDPOINT)));

    const doctorBonus = 1 + Math.max(0, doctorLevel) * DOCTOR_BONUS_PER_LEVEL;

    return Math.round(sigmoid * 10 * doctorBonus) / 10;
}

/**
 * 估算从当前伤病值完全康复所需天数。
 *
 * @param currentInjuryValue 当前伤病值
 * @param playerAge 球员年龄
 * @param doctorLevel 队医等级
 * @param dailyRecovery 可选：调用方已算好的 dailyRecovery，传进来避免
 *   内部再算一遍（applyDailyInjuryRecovery 会用到）。
 * @returns 估算剩余天数 (>= 1, 已恢复返回 0)
 */
export function estimateRecoveryDays(
    currentInjuryValue: number,
    playerAge: number,
    doctorLevel: number = 0,
    dailyRecovery?: number,
): number {
    if (currentInjuryValue <= 0) return 0;

    const daily = dailyRecovery ?? calculateDailyRecovery(playerAge, doctorLevel);
    if (daily <= 0) return Number.POSITIVE_INFINITY;

    return Math.max(1, Math.ceil(currentInjuryValue / daily));
}

// ============================================================
// Bulk DB operations — shared by API service, simulator, and
// the daily recovery cron. Caller passes the `EntityManager` so
// these can run inside a larger transaction (the simulator
// composes them with the match-event writes; the cron opens its
// own).
// ============================================================

/** Input shape for `applyInjuryBatch`. */
export interface ApplyInjuryInput {
    playerId: number;
    /** Optional — usually the match the injury happened in. */
    matchId?: string | null;
    injuryType: 'muscle' | 'ligament' | 'joint' | 'head' | 'other';
    /** Post-2026-08-06 collapse: 1 = mild, 2 = severe. */
    severity: 1 | 2;
    injuryValue: number;
    /** Single deterministic recovery estimate (days). */
    estimatedDays: number;
    /** Defaults to `new Date()`. Override for back-dated tests. */
    occurredAt?: Date;
}

/** Output shape for `applyDailyInjuryRecovery`. */
export interface RecoveryResult {
    playerId: number;
    playerName: string;
    injuryType: string | undefined;
    /** `team.userId` at the time of recovery, captured from the
     *  caller's input. `null` if the player had no team (free
     *  agent) or the team has no userId (bot team). */
    userId: string | null;
}

/**
 * Bulk-apply injuries. Inserts one row per item into `injury`
 * and updates each affected player's cache (`currentInjuryValue`,
 * `injuryType`, `injuryState`, `injuredAt`) inside the caller's
 * `EntityManager` transaction.
 *
 * Used by the simulator's match-completion block to commit
 * the new injury rows + player-side cache atomically with the
 * rest of the match writes (events, career stats, etc.).
 *
 * Ghost-injury guard (P2-#8): if a player already has an active
 * injury row (recoveredAt IS NULL), the new item is **skipped** —
 * we don't insert a second active row, and we don't overwrite
 * the player's `currentInjuryValue` either. The existing injury
 * continues to recover normally. The match-event row in
 * `match_event` is still written (the engine decides that), so
 * the player will see the second injury in their match log; this
 * helper only protects the `injury` table from accumulating
 * multiple active rows per player.
 */
export async function applyInjuryBatch(
    manager: EntityManager,
    items: ApplyInjuryInput[],
): Promise<InjuryEntity[]> {
    if (items.length === 0) return [];

    const injuryRepo = manager.getRepository(InjuryEntity);
    const playerRepo = manager.getRepository(PlayerEntity);

    // Look up any pre-existing active injuries for the players in
    // this batch. One query covers the whole batch; if any player
    // already has a row with `recoveredAt IS NULL`, drop the new
    // item from the write set.
    const playerIds = Array.from(new Set(items.map((i) => i.playerId)));
    const existingActive = await injuryRepo.find({
        where: {
            playerId: In(playerIds),
            recoveredAt: IsNull(),
        },
        select: { playerId: true },
    });
    const playersWithActiveInjury = new Set(
        existingActive.map((row) => row.playerId),
    );

    const itemsToWrite = items.filter(
        (item) => !playersWithActiveInjury.has(item.playerId),
    );
    if (itemsToWrite.length === 0) return [];

    const now = new Date();
    const records = itemsToWrite.map((item) =>
        injuryRepo.create({
            playerId: item.playerId,
            matchId: item.matchId ?? null,
            injuryType: item.injuryType,
            severity: item.severity,
            injuryValue: item.injuryValue,
            estimatedMaxDays: item.estimatedDays,
            occurredAt: item.occurredAt ?? now,
        }),
    );
    const saved = await injuryRepo.save(records);

    // Update each player's "currently injured" cache. We do one
    // `update` per item instead of a CASE-based bulk update so the
    // type signature stays simple — at 80% severe-injury rate the
    // typical batch per match is 1-3 rows.
    for (const item of itemsToWrite) {
        await playerRepo.update(
            { id: item.playerId },
            {
                currentInjuryValue: item.injuryValue,
                injuryType: item.injuryType,
                injuryState:
                    item.injuryValue <=
                    GAME_SETTINGS.INJURY_MINOR_VALUE_THRESHOLD
                        ? 'minor'
                        : 'severe',
                injuredAt: item.occurredAt ?? now,
            },
        );
    }

    return saved;
}

/**
 * Apply the daily injury-recovery tick. For each input:
 *   - decrement `currentInjuryValue` by `calculateDailyRecovery(age, doctorLevel)`,
 *     rounded to int so the int column never silently truncates;
 *   - if the new value is in the "minor" band AND the estimated
 *     days-to-recovery is ≤ 7, set `injuryState = 'minor'`
 *     (the player can return at 95% ability);
 *   - if the new value hits 0, clear `injuryType / injuryState /
 *     injuredAt` and stamp `recoveredAt` on the active injury row.
 *
 * All player writes go through ONE batched save (the partial-
 * recovery decrements and the cleared fields commit together —
 * P0-#3). All injury writes go through ONE batched save.
 *
 * Returns the list of fully-recovered players so the caller can
 * send notifications without a per-player re-query.
 */
export async function applyDailyInjuryRecovery(
    manager: EntityManager,
    inputs: Array<{
        player: PlayerEntity;
        doctorLevel: number;
    }>,
    now: Date = new Date(),
): Promise<RecoveryResult[]> {
    if (inputs.length === 0) return [];

    const injuryRepo = manager.getRepository(InjuryEntity);
    const playerRepo = manager.getRepository(PlayerEntity);

    const playersToSave: PlayerEntity[] = [];
    const injuriesToRecover: Array<{
        player: PlayerEntity;
        oldValue: number;
        userId: string | null;
    }> = [];

    for (const { player, doctorLevel } of inputs) {
        const [years, days] = player.getExactAge();
        const playerAge = years + days / GAME_SETTINGS.DAYS_PER_YEAR;

        const dailyRecovery = calculateDailyRecovery(playerAge, doctorLevel);
        const oldValue = player.currentInjuryValue;
        // Round before clamping: `dailyRecovery` is a 1-decimal
        // float and `currentInjuryValue` is an `int` column, so PG
        // would otherwise silently truncate (P1-#9).
        const rawNewValue = oldValue - dailyRecovery;
        const newValue = Math.max(0, Math.round(rawNewValue));

        // Pass `dailyRecovery` so the helper doesn't re-compute
        // it (P2-#13 — same sigmoid was called twice per player
        // per tick before this).
        const estimatedDays = estimateRecoveryDays(
            newValue,
            playerAge,
            doctorLevel,
            dailyRecovery,
        );

        if (
            newValue > 0 &&
            newValue <= GAME_SETTINGS.INJURY_MINOR_VALUE_THRESHOLD &&
            estimatedDays <= 7
        ) {
            player.injuryState = 'minor';
        }

        player.currentInjuryValue = newValue;
        playersToSave.push(player);

        if (newValue === 0 && oldValue > 0) {
            // Fully recovered this tick — clear the player-side
            // cache NOW so the batched save commits the cleared
            // state atomically with the partial decrements.
            player.injuryType = null;
            player.injuryState = null;
            player.injuredAt = null;

            // The cron caller is expected to have populated
            // `player.team.userId`; we capture it here once so the
            // notification step doesn't need a re-query (P0-#3).
            const team = (player as PlayerEntity & { team?: { userId?: string | null } }).team;
            injuriesToRecover.push({
                player,
                oldValue,
                userId: team?.userId ?? null,
            });
        }
    }

    if (playersToSave.length === 0) return [];

    // Single batched save covers both partial-recovery decrements
    // and the cleared fields for fully-recovered players.
    await playerRepo.save(playersToSave);

    if (injuriesToRecover.length === 0) return [];

    // Find and stamp the active injury row for each recovered
    // player. Query is DESC on `occurredAt`, so the first row per
    // playerId is the most recent (active) injury.
    const recoveredPlayerIds = injuriesToRecover.map((r) => r.player.id);
    const activeInjuries = await injuryRepo.find({
        where: {
            playerId: In(recoveredPlayerIds),
            recoveredAt: IsNull(),
        },
        order: { occurredAt: 'DESC' },
    });
    const injuryByPlayer = new Map<number, InjuryEntity>();
    for (const inj of activeInjuries) {
        const isFirstForPlayer = !injuryByPlayer.has(inj.playerId);
        if (isFirstForPlayer) {
            injuryByPlayer.set(inj.playerId, inj);
            inj.recoveredAt = now;
        }
        // Defensive: a player should only have one active injury
        // at a time. If a future write path leaves a second row
        // open, leave it alone rather than stamp a recovery it
        // didn't earn. Active-injury uniqueness is enforced by
        // `applyInjuryBatch`.
    }
    if (activeInjuries.length > 0) {
        await injuryRepo.save(activeInjuries);
    }

    return injuriesToRecover.map((r) => ({
        playerId: r.player.id,
        playerName: r.player.name,
        injuryType: injuryByPlayer.get(r.player.id)?.injuryType,
        userId: r.userId,
    }));
}

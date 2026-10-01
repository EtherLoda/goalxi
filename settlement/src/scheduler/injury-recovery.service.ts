import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import {
  PlayerEntity,
  StaffEntity,
  StaffRole,
  Uuid,
  applyDailyInjuryRecovery,
  GAME_SETTINGS,
} from '@goalxi/database';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';

/**
 * Daily injury-recovery cron. Originally scheduled for 2 AM
 * every day, but a missed 2 AM (server down, deployment
 * window, etc.) silently skipped that day's recovery and
 * left players with stale injury values until the next day.
 * Now runs HOURLY and dedupes via a module-scoped
 * `lastRecoveryRunAt` timestamp: the first tick inside a 23h
 * window runs the recovery; subsequent ticks within the same
 * window early-return. A process restart clears the
 * timestamp, so a freshly-started process after a missed
 * tick will catch up on its next hourly slot (P2-#6 in the
 * injury-chain review).
 *
 * Orchestration only:
 *   1. Find injured players + their team (1 query).
 *   2. Filter out bot teams, build a doctorByTeam map (1 query).
 *   3. Delegate the actual write to
 *      `applyDailyInjuryRecovery(...)` in
 *      `libs/database/src/services/injury-recovery-calculator.ts`.
 *      That helper does the daily decrement, the recovery-clear,
 *      the active-injury `recoveredAt` stamp, and the batched
 *      player save — all in one transaction.
 *   4. Send PLAYER_RECOVERED notifications.
 *
 * The write path used to live inline here (P0-#2 had it duplicated
 * with `injuryService.updatePlayerInjury`); both implementations
 * drifted once already. The shared helper in `libs/database` is now
 * the only canonical contract, called by the cron and by the
 * simulator's match-completion path.
 */

/**
 * Minimum gap between two successful recovery runs. Anything
 * shorter is a redundant tick (e.g. the hourly cron firing on
 * the same day as a manual recovery run). 23h gives a 1h
 * safety margin across DST transitions.
 */
const RECOVERY_MIN_GAP_MS = 23 * 60 * 60 * 1000;

/** Last successful run timestamp (module-scoped — survives
 *  across cron ticks in the same process, resets on restart). */
let lastRecoveryRunAt: Date | null = null;

/**
 * Test-only helper. Resets the dedup timestamp so a test can
 * re-run `processDailyInjuryRecovery` without waiting 23h.
 * Not exported through the Nest module — the spec imports the
 * source file directly to access this internal.
 */
export function _resetInjuryRecoveryDedupForTests(): void {
  lastRecoveryRunAt = null;
}

@Injectable()
export class InjuryRecoveryService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(PlayerEntity)
    private playerRepository: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepository: Repository<StaffEntity>,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('0 30 * * * *', { timeZone: GAME_SETTINGS.CRON_TIME_ZONE })
  async processDailyInjuryRecovery() {
    const now = new Date();

    // Dedup: a successful recovery already ran within the
    // 23h safety window. This is the only check that keeps
    // the hourly cron from double-decrementing the same day.
    // On a process restart the timestamp resets to null, so
    // the next tick after a missed 2 AM still catches up.
    if (
      lastRecoveryRunAt !== null &&
      now.getTime() - lastRecoveryRunAt.getTime() < RECOVERY_MIN_GAP_MS
    ) {
      this.logger.debug(
        `[InjuryRecovery] Skipping — last successful run was at ${lastRecoveryRunAt.toISOString()}`,
      );
      return;
    }

    this.logger.info(
      `[InjuryRecovery] Running daily injury recovery at ${now.toISOString()}`,
    );

    // 1. Pull injured players with their team in a single query.
    // We need `team` to filter bot teams and to capture `team.userId`
    // for the notification step.
    const injuredPlayers = await this.playerRepository.find({
      where: { currentInjuryValue: MoreThanOrEqual(1) },
      relations: ['team'],
    });

    this.logger.info(
      `[InjuryRecovery] Found ${injuredPlayers.length} player(s) with active injuries`,
    );

    if (injuredPlayers.length === 0) {
      return;
    }

    // 2. Filter non-bot players and build the doctorByTeam map
    // (single doctor find covers all teams — was: N per team).
    const eligiblePlayers: PlayerEntity[] = [];
    const activeTeamIds = new Set<Uuid>();
    for (const p of injuredPlayers) {
      const team = p.team;
      if (!team || team.isBot) {
        if (team?.isBot) {
          this.logger.debug(`[InjuryRecovery] Skipping bot player: ${p.name}`);
        }
        continue;
      }
      eligiblePlayers.push(p);
      activeTeamIds.add(p.teamId as Uuid);
    }

    const doctorLevelByTeam = new Map<Uuid, number>();
    if (activeTeamIds.size > 0) {
      const doctors = await this.staffRepository.find({
        where: {
          teamId: In(Array.from(activeTeamIds)),
          role: StaffRole.TEAM_DOCTOR,
          isActive: true,
        },
      });
      for (const d of doctors) {
        doctorLevelByTeam.set(d.teamId as Uuid, d.level ?? 0);
      }
    }

    if (eligiblePlayers.length === 0) {
      this.logger.info(
        `[InjuryRecovery] Completed. 0 player(s) fully recovered today.`,
      );
      return;
    }

    // 3. Delegate to the shared helper. The helper runs in its own
    // transaction (via `dataSource.transaction`) and returns the
    // list of fully-recovered players for the notification step.
    let recoveries: Array<{
      playerId: number;
      playerName: string;
      injuryType: string | undefined;
      userId: string | null;
    }> = [];
    try {
      recoveries = await this.dataSource.transaction(async (manager) => {
        return applyDailyInjuryRecovery(
          manager,
          eligiblePlayers.map((player) => ({
            player,
            doctorLevel: doctorLevelByTeam.get(player.team!.id) ?? 0,
          })),
          now,
        );
      });
    } catch (error) {
      this.logger.error(`[InjuryRecovery] Daily tick failed:`, error);
      throw error;
    }

    // 4. Notify each recovered player's team manager.
    //
    // Each notification is independently guarded: a Redis blip on one
    // player must not abandon the notifications for every player after
    // it, and — critically — must not abort the method before the dedup
    // stamp below, which would make the next hourly tick re-run the
    // whole recovery pass and decrement every injured player's
    // `current_injury_value` a SECOND time. That was the previous
    // behaviour: the loop had no try/catch, `notificationService.create`
    // writes to Redis, one throw escaped, `@nestjs/schedule` swallowed it
    // into a log line, `lastRecoveryRunAt` was never set, and the
    // recovery re-ran.
    let recoveredCount = 0;
    let notificationFailures = 0;
    for (const r of recoveries) {
      if (r.userId) {
        try {
          await this.notificationService.create(
            r.userId,
            NotificationType.PLAYER_RECOVERED,
            'notification.playerRecovered',
            {
              playerId: r.playerId,
              playerName: r.playerName,
              injuryType: r.injuryType,
            },
          );
        } catch (error) {
          notificationFailures++;
          this.logger.error(
            `[InjuryRecovery] Failed to notify ${r.userId} of ` +
              `${r.playerName}'s recovery: ${(error as Error).message}. ` +
              `The recovery itself is already committed and the dedup ` +
              `stamp will still be set — only the notification is lost.`,
            (error as Error).stack,
          );
        }
      }

      recoveredCount++;
      this.logger.info(
        `[InjuryRecovery] Player ${r.playerName} (${r.playerId}) has fully recovered!`,
      );
    }

    if (notificationFailures > 0) {
      this.logger.warn(
        `[InjuryRecovery] ${notificationFailures} of ${recoveries.length} recovery notification(s) failed`,
      );
    }

    this.logger.info(
      `[InjuryRecovery] Completed. ${recoveredCount} player(s) fully recovered today.`,
    );

    // Stamp the dedup timestamp AFTER the recovery helper commits AND
    // after the (now failure-tolerant) notification pass. If the
    // transaction threw, `lastRecoveryRunAt` stays unchanged and the
    // next tick retries from a rolled-back state. Successful runs block
    // the next 23h.
    //
    // Process restarts also reset this module-scoped variable, which is
    // why the container must be started at most once per recovery
    // window — see the note on `lastRecoveryRunAt` above.
    lastRecoveryRunAt = now;
  }
}

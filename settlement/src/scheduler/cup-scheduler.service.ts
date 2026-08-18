import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull, Not } from 'typeorm';
import {
  CupBracketSlotEntity,
  CupEntity,
  CupRoundEntity,
  CupRoundStatus,
  CupStatus,
  MatchEntity,
  MatchStatus,
  MatchType,
  type Uuid,
} from '@goalxi/database';

/**
 * Materializes `MatchEntity` rows from the cup's bracket slots.
 *
 * For every `cup_round` whose `status='pending'` and
 * `scheduled_at <= now`, the scheduler:
 *
 *   1. CAS-flips the round to `in_progress` (only 1 tick wins).
 *   2. Reads the round's bracket slots in `slot_index` order.
 *   3. For each pair of slots (0,1), (2,3), ...:
 *      - If both slots have a home/away team and `match_id IS NULL`,
 *        creates a `MatchEntity` (type=CUP, leagueId=NULL,
 *        round=roundNumber, scheduledAt=round.scheduledAt) and
 *        stamps `matchId` on BOTH slots.
 *      - If the slot is a bye (home only), the slot's `winnerTeamId`
 *        was set at cup-creation time and the match row is skipped
 *        — the bye team just "advances" via the slot, no MatchEntity
 *        needed.
 *
 * The `MatchPreprocessScheduler` (existing infra) picks up the
 * newly-created cup match rows by the same `LessThanOrEqual(
 * scheduledAt - tactics_deadline)` filter it uses for league
 * matches — the cup is invisible to the match preprocessor.
 * The cup-specific preprocessor path lives in this scheduler.
 *
 * ## Idempotency
 *
 * The CAS on round.status prevents two ticks from both creating
 * matches for the same round. Per-slot, the `matchId IS NULL`
 * filter on the UPDATE is the second layer — re-runs after a
 * crash find slots with `matchId` already set and skip them.
 *
 * ## Why the match row is needed
 *
 * The match simulation pipeline (tactics lock, weather fetch,
 * sim worker, completion broadcast) is built around
 * `MatchEntity`. Reusing the existing infra — instead of
 * building a parallel "cup match" pipeline — saves the
 * ~2000-line MatchEventType / match.live / match.tactics
 * machinery. The cup scheduler only needs to write the
 * `MatchEntity` row; the rest of the stack takes over.
 */
@Injectable()
export class CupSchedulerService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(MatchEntity)
    private readonly matchRepo: Repository<MatchEntity>,
    @InjectRepository(CupEntity)
    private readonly cupRepo: Repository<CupEntity>,
    @InjectRepository(CupRoundEntity)
    private readonly roundRepo: Repository<CupRoundEntity>,
    @InjectRepository(CupBracketSlotEntity)
    private readonly slotRepo: Repository<CupBracketSlotEntity>,
  ) {}

  /**
   * Cron every minute on the second `:00`. The query is a
   * `SELECT ... WHERE status=pending AND scheduledAt<=now`,
   * so a tighter cadence is pure overhead. 1 minute is the
   * same cadence the league `MatchPreprocessScheduler` uses
   * — picked deliberately so cup and league picks happen
   * within the same wall-clock second.
   *
   * Why 1m and not 5s/30s:
   *  - All match kickoff times are deterministic and known
   *    in advance (`scheduledAt` is set at cup creation).
   *    A 1m scan can never miss a kickoff (worst case: the
   *    kickoff is at 06:00:00 and the tick fires at 06:00:30
   *    — the round still flips within 30s of the deadline).
   *  - 1m is the smallest cadence that still tolerates
   *    `scheduledAt` being edited at runtime (rescheduled
   *    rounds, makeup games) without needing a separate
   *    wake-up mechanism. A fixed "0 6 * * 2" cron would
   *    miss any rescheduling.
   *  - CAS on round.status guarantees the work is done at
   *    most once regardless of cadence, so a slower tick
   *    is purely a latency tradeoff, not a correctness one.
   */
  @Cron('0 * * * * *')
  async scheduleDueCupRounds(): Promise<void> {
    const now = new Date();
    // PENDING rounds whose scheduledAt is in the past. We
    // intentionally do NOT include `scheduled_at IS NULL` —
    // those are the "initDate was missing" case (Phase 2
    // bootstrap) and the round just stays pending until a
    // user re-runs `pnpm init:run --init-date=...`. We do
    // NOT auto-back-fill the date here because the round
    // ordering is fragile to retroactive edits.
    const dueRounds = await this.roundRepo.find({
      where: {
        status: CupRoundStatus.PENDING,
        scheduledAt: LessThanOrEqual(now),
      },
    });
    if (dueRounds.length === 0) return;

    for (const round of dueRounds) {
      try {
        await this.materializeRound(round);
      } catch (err) {
        this.logger.error(
          `[CupScheduler] Failed to materialize round ${round.id} (cup=${round.cupId} roundNumber=${round.roundNumber}): ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }
  }

  /**
   * Materialize one round: CAS to in_progress, then create
   * a MatchEntity for every pair of slots. Returns the
   * number of matches created (0 if all slots were byes).
   */
  private async materializeRound(round: CupRoundEntity): Promise<number> {
    // CAS — only one tick wins. affected === 0 means another
    // tick already started this round; bail.
    const cas = await this.roundRepo.update(
      { id: round.id, status: CupRoundStatus.PENDING },
      { status: CupRoundStatus.IN_PROGRESS },
    );
    if (!cas.affected) {
      this.logger.debug(
        `[CupScheduler] Round ${round.id} CAS miss — another tick won, skipping`,
      );
      return 0;
    }

    // Read the cup so we can stamp `season` on the match row.
    // (MatchEntity.season is NOT NULL — see migration 1700000010.)
    const cup = await this.cupRepo.findOne({ where: { id: round.cupId } });
    if (!cup) {
      this.logger.error(
        `[CupScheduler] Cup ${round.cupId} not found for round ${round.id} — flipping round back to PENDING`,
      );
      await this.roundRepo.update(round.id, {
        status: CupRoundStatus.PENDING,
      });
      return 0;
    }
    // Set the cup status to IN_PROGRESS on the first round
    // materialization. Idempotent — the second round won't
    // re-flip an already-in-progress cup.
    if (cup.status === CupStatus.PENDING) {
      await this.cupRepo.update(cup.id, { status: CupStatus.IN_PROGRESS });
    }

    // Pull all slots for this round, sorted by slot_index. The
    // pair (slot[i], slot[i+1]) for even i is one match.
    const slots = await this.slotRepo.find({
      where: { roundId: round.id },
      order: { slotIndex: 'ASC' },
    });

    if (slots.length === 0) {
      this.logger.warn(
        `[CupScheduler] Round ${round.id} (cup=${round.cupId} roundNumber=${round.roundNumber}) has no bracket slots — nothing to materialize`,
      );
      return 0;
    }

    let matchesCreated = 0;
    for (let i = 0; i < slots.length; i += 2) {
      const homeSlot = slots[i];
      const awaySlot = slots[i + 1];
      if (!homeSlot || !awaySlot) {
        this.logger.warn(
          `[CupScheduler] Round ${round.id} has odd slot count (${slots.length}) — last slot orphan, skipping. ` +
            `Byes for this round need a follow-up (MVP currently assumes L1-L4 = no byes).`,
        );
        break;
      }
      // Skip if either slot already has a match (idempotent
      // re-run after a partial crash) or is a bye.
      if (homeSlot.matchId || awaySlot.matchId) continue;
      if (homeSlot.isBye || awaySlot.isBye) continue;
      if (!homeSlot.homeTeamId || !awaySlot.awayTeamId) {
        this.logger.error(
          `[CupScheduler] Round ${round.id} slot pair ${i}/${i + 1} missing teams (homeSlot.homeTeamId=${homeSlot.homeTeamId}, awaySlot.awayTeamId=${awaySlot.awayTeamId}) — skipping`,
        );
        continue;
      }

      const match = await this.matchRepo.save(
        this.matchRepo.create({
          leagueId: null, // cup matches don't belong to a league
          season: cup.season,
          // `week=0` is the explicit "non-league" sentinel. The
          // league `ScheduleGenerator` derives `week` from
          // `scheduledAt` via `weekFromScheduledAt` (always
          // returns ≥1); we OVERRIDE that to 0 here because:
          //   1. The cup has no league-week concept — a cup
          //      round spans Tuesday, which doesn't align with
          //      the Mon-Sun league week.
          //   2. The season-transition cron gates on
          //      `week === 15` (the league's last match week).
          //      A cup match with `week=15` (e.g. scheduled
          //      during that calendar week) would falsely fire
          //      the playoff trigger.
          //   3. The FE/queries that filter `week > 0` skip cup
          //      rows by design — cup is identified by
          //      `type='CUP' AND leagueId IS NULL`, not by
          //      week.
          // The cup round number is carried in `round` (0..N-1).
          week: 0,
          round: round.roundNumber,
          homeTeamId: homeSlot.homeTeamId as Uuid,
          awayTeamId: awaySlot.awayTeamId as Uuid,
          status: MatchStatus.SCHEDULED,
          type: MatchType.CUP,
          tacticsLocked: false,
          homeForfeit: false,
          awayForfeit: false,
          scheduledAt: round.scheduledAt ?? new Date(),
        }),
      );
      // Stamp the matchId on BOTH slots so the progress worker
      // can find them later via `matchId = match.id`.
      await this.slotRepo.update(
        { id: homeSlot.id },
        { matchId: match.id },
      );
      await this.slotRepo.update(
        { id: awaySlot.id },
        { matchId: match.id },
      );
      matchesCreated++;
    }

    this.logger.info(
      `[CupScheduler] Materialized round ${round.id} (cup=${round.cupId} roundNumber=${round.roundNumber}): ${matchesCreated} match(es) from ${slots.length} slot(s)`,
    );
    return matchesCreated;
  }
}

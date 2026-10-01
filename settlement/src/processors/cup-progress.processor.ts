import { Injectable, Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, In, Not } from 'typeorm';
import { Job } from 'bullmq';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import {
  CupBracketSlotEntity,
  CupEntity,
  CupEntryEntity,
  CupRoundEntity,
  CupRoundStatus,
  CupStatus,
  MatchEntity,
  MatchStatus,
  MatchType,
  type Uuid,
} from '@goalxi/database';

/**
 * Payload contract for `cup-progress` jobs. Re-declared here
 * rather than imported across the workspace boundary because
 * settlement and the API are sibling services — matching by hand
 * is the right level of loose coupling. The job name is
 * `complete-match` (see `match-scheduler.service.ts:completeMatches`).
 */
export interface CompleteMatchJobPayload {
  matchId: string;
}

/**
 * BullMQ consumer for cup match completions.
 *
 * ## Why this has its own queue
 *
 * This processor used to be decorated `@Processor('match-completion')`
 * — the same queue `api/src/background/queues/match-completion/match-completion.processor.ts`
 * consumes. That was broken: **BullMQ workers compete for jobs, they
 * do not broadcast them.** Every job goes to exactly one worker, so
 * the split was a coin flip per match:
 *
 *   - a CUP job landing on the API worker ran `completeMatch` but
 *     never stamped the bracket → the round never closed, the cup
 *     deadlocked;
 *   - a LEAGUE job landing here hit the `match.type !== CUP`
 *     early-return → **no standings, no ELO, no ticket revenue,
 *     no match minutes** — and the job was acked as completed, so
 *     nothing retried it.
 *
 * `match-completion` now carries only league/settlement work, and
 * `MatchSchedulerService.completeMatches` fans a CUP match out to
 * both queues. The `match.type !== CUP` guard below stays as
 * defence-in-depth (a misrouted job should no-op, not corrupt a
 * bracket).
 *
 * ## Per-match flow
 *
 *   1. Stamp the slot's `winner_team_id` from the match result.
 *      CAS on `winner_team_id IS NULL` so a duplicate tick
 *      (e.g. BullMQ retry) doesn't double-write.
 *   2. Stamp the losing team's `cup_entry.eliminated_in_round`
 *      so the FE can render the "team X was eliminated in R3"
 *      badge.
 *   3. Check if the round is now complete (every slot has a
 *      winner). If so, CAS the round to `completed`. Only one
 *      tick wins the CAS — the others bail.
 *   4. On round completion:
 *      a. If the round is the last one (Final), mark the cup
 *         completed and stamp `final_position=1` on the champion
 *         and `final_position=2` on the runner-up. Note that
 *         `winnerTeamId` on a slot holds the MATCH winner (stamped
 *         on both slots for FE rendering), so the runner-up is
 *         derived from the final's home/away ids, not from a slot's
 *         `winnerTeamId`.
 *      b. Otherwise, build the next round's bracket slots from
 *         this round's winners + any new tier entries for that
 *         round. Schedule them at the next round's
 *         `scheduled_at`.
 *
 * ## Cross-tier new entries
 *
 * When the next round is one where a higher tier enters (e.g.
 * R4 in the L1-L4 pyramid — L2 teams enter here), the new
 * teams have their own `cup_entry` rows with a `seed_rank` set
 * at cup-creation time. The pairing logic uses ELO descending
 * to merge the new entries with the previous round's winners,
 * giving the highest-ELO teams the "home" slot.
 *
 * ## Concurrency
 *
 * `@Processor('cup-progress', { concurrency: 4 })`. This queue
 * carries only cup matches, so the worker pool cannot starve the
 * league completion path (which runs single-threaded on
 * `match-completion`). Cup closeout is cheap — a handful of
 * updates per match — so the pool is sized for bracket latency,
 * not throughput.
 */
@Injectable()
@Processor('cup-progress', { concurrency: 4 })
export class CupProgressProcessor extends WorkerHost {
  /**
   * @nestjs/bullmq requires either a no-arg constructor or
   * one that delegates to `super()`. We use Nest DI for the
   * rest, then call super() at the end.
   */
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
    @InjectRepository(CupEntryEntity)
    private readonly entryRepo: Repository<CupEntryEntity>,
  ) {
    super();
  }

  async process(job: Job<CompleteMatchJobPayload>): Promise<void> {
    if (job.name !== 'complete-match') {
      // `cup-progress` carries only cup closeout jobs. Log rather than
      // silently drop — a typo in an enqueue call site is otherwise
      // invisible (the job is still acked as completed).
      this.logger.warn(
        `[CupProgress] Ignoring job with unexpected name "${job.name}" (jobId=${job.id})`,
      );
      return;
    }
    const { matchId } = job.data;
    if (!matchId) {
      this.logger.warn('[CupProgress] Job missing matchId, skipping');
      return;
    }
    try {
      await this.handleCompletedMatch(matchId as Uuid);
    } catch (err) {
      this.logger.error(
        `[CupProgress] handleCompletedMatch failed for matchId=${matchId}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err; // retried by the enqueue call site's `attempts` policy
    }
  }

  /**
   * Top-level handler. Reads the match, no-ops if it's not a
   * cup match, then runs the per-match stamp + round closeout.
   */
  private async handleCompletedMatch(matchId: Uuid): Promise<void> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) {
      this.logger.warn(`[CupProgress] matchId=${matchId} not found, skipping`);
      return;
    }
    if (match.type !== MatchType.CUP) {
      // Defence-in-depth. The `cup-progress` queue only receives
      // `MatchType.CUP` matches (`MatchSchedulerService.completeMatches`
      // filters on `match.type`), so this only fires if a caller
      // misroutes a job. No-op rather than corrupt a bracket.
      this.logger.warn(
        `[CupProgress] matchId=${matchId} is type=${match.type}, not CUP — skipping`,
      );
      return;
    }
    if (match.status !== MatchStatus.COMPLETED) {
      // The `cup-progress` job is enqueued after `MatchSchedulerService`
      // flips the match to COMPLETED, but be defensive: a manual
      // re-enqueue or a mid-flight status change should no-op.
      this.logger.debug(
        `[CupProgress] matchId=${matchId} status=${match.status} — not COMPLETED, skipping cup progress`,
      );
      return;
    }

    // 1. Determine winner from the match result FIRST so we
    //    bail out on a tied score without touching the slot
    //    table (data corruption sentinel — the simulator
    //    should never produce an undecided match).
    const winnerTeamId = this.determineWinner(match);
    if (!winnerTeamId) {
      this.logger.error(
        `[CupProgress] matchId=${match.id} has no decidable winner ` +
          `(homeScore=${match.homeScore} awayScore=${match.awayScore})`,
      );
      return;
    }
    const loserTeamId =
      winnerTeamId === (match.homeTeamId as Uuid)
        ? (match.awayTeamId as Uuid)
        : (match.homeTeamId as Uuid);

    // 2. Find the slot pair tied to this match. From the
    //    first slot we get the roundId, and from the round
    //    we get cupId — the MatchEntity doesn't carry cupId
    //    directly (cup matches have leagueId=NULL), so the
    //    slot is our entry point.
    const slots = await this.slotRepo.find({
      where: { matchId: match.id as Uuid },
    });
    if (slots.length !== 2) {
      this.logger.error(
        `[CupProgress] matchId=${match.id} has ${slots.length} slot(s), expected 2 — corruption?`,
      );
      return;
    }
    const round = await this.roundRepo.findOne({
      where: { id: slots[0].roundId },
    });
    if (!round) {
      this.logger.error(
        `[CupProgress] Round ${slots[0].roundId} (slot.matchId=${match.id}) not found`,
      );
      return;
    }
    const cupId = round.cupId;

    // 3. Stamp winner on BOTH slots. The CAS guard prevents
    //    double-write on a BullMQ retry.
    await this.stampSlotWinner(slots, winnerTeamId);

    // 4. Stamp the loser's eliminated_in_round.
    if (loserTeamId) {
      await this.stampLoserEliminated(
        cupId,
        loserTeamId,
        this.roundNumberForMatch(match),
      );
    }

    // 5. Try to close out the round. Only one tick wins the CAS.
    const roundNumber = this.roundNumberForMatch(match);
    const closed = await this.tryCloseRound(round, cupId, roundNumber);
    if (!closed) {
      this.logger.debug(
        `[CupProgress] Round ${roundNumber} not yet closable for matchId=${match.id} (other matches pending, or another tick won)`,
      );
    }
  }

  /**
   * `home_score === away_score` after extra time + penalties
   * should never happen — the simulator stamps `homeScore` /
   * `awayScore` with the final result and the winner is encoded
   * in the higher score (or in a separate column). For the MVP
   * we use the simple "higher score wins" rule. Tied scores
   * without ET/penalties resolved are a data corruption issue;
   * we log loudly and bail.
   */
  private determineWinner(match: MatchEntity): Uuid | null {
    if (match.homeScore == null || match.awayScore == null) return null;
    if (match.homeScore > match.awayScore) return match.homeTeamId as Uuid;
    if (match.awayScore > match.homeScore) return match.awayTeamId as Uuid;
    return null;
  }

  private roundNumberForMatch(match: MatchEntity): number {
    // `match.round` is 0-indexed for cup matches. Falls back
    // to 0 if the column is somehow null (shouldn't happen
    // because the scheduler stamps it).
    return match.round ?? 0;
  }

  /**
   * Set `winner_team_id` on both slots tied to the match.
   * The slot whose `homeTeamId` matches the winner is the
   * "primary" slot — we also stamp the other slot as a
   * mirror so cross-round queries can join on either.
   */
  private async stampSlotWinner(
    slots: CupBracketSlotEntity[],
    winnerTeamId: Uuid,
  ): Promise<void> {
    for (const slot of slots) {
      // The primary slot has the winner as its `homeTeamId`;
      // the mirror slot has the winner as its `awayTeamId`.
      // For the mirror slot the `isBye` flag is false and
      // `homeTeamId` is the LOSER (because the slot is "this
      // team's perspective on the match"). We always stamp
      // the winner regardless of which perspective the slot
      // is, so the FE can render the bracket.
      if (slot.winnerTeamId) continue; // already set — skip
      await this.slotRepo.update(
        { id: slot.id, winnerTeamId: IsNull() },
        { winnerTeamId },
      );
    }
  }

  /**
   * Mark the loser's `cup_entry.eliminated_in_round` so the FE
   * can render "team X was eliminated in R3" badges.
   *
   * The CAS guard (`eliminated_in_round IS NULL`) makes this
   * safe across BullMQ retries — only the first write sticks.
   */
  private async stampLoserEliminated(
    cupId: Uuid,
    loserTeamId: Uuid,
    roundNumber: number,
  ): Promise<void> {
    await this.entryRepo.update(
      {
        cupId,
        teamId: loserTeamId,
        eliminatedInRound: IsNull(),
      },
      { eliminatedInRound: roundNumber },
    );
  }

  /**
   * Try to close out the round. Returns true if THIS tick
   * did the closeout (so the caller can chain next-round
   * slot creation), false if the round wasn't ready or
   * another tick won the CAS.
   */
  private async tryCloseRound(
    round: CupRoundEntity,
    cupId: Uuid,
    roundNumber: number,
  ): Promise<boolean> {
    // 1. Count slots with vs without winner.
    const totalSlots = await this.slotRepo.count({
      where: { roundId: round.id },
    });
    const slotsWithWinner = await this.slotRepo.count({
      where: { roundId: round.id, winnerTeamId: Not(IsNull()) },
    });
    if (slotsWithWinner < totalSlots) {
      // Round not yet done.
      return false;
    }

    // 2. CAS the round to COMPLETED.
    const cas = await this.roundRepo.update(
      { id: round.id, status: CupRoundStatus.IN_PROGRESS },
      { status: CupRoundStatus.COMPLETED },
    );
    if (!cas.affected) {
      // Another tick already won the closeout.
      return false;
    }

    this.logger.info(
      `[CupProgress] Round ${round.roundNumber} of cup ${round.cupId} closed: ` +
        `${slotsWithWinner}/${totalSlots} slot(s) resolved`,
    );

    // 3. Stamp final_position on the entries of the last round.
    const cup = await this.cupRepo.findOne({ where: { id: cupId } });
    if (!cup) return true;

    // Is this the last round of the cup? The roundNumber of
    // the cup's last `cup_round` row.
    const lastRound = await this.roundRepo
      .createQueryBuilder('r')
      .where('r.cup_id = :cupId', { cupId })
      .orderBy('r.round_number', 'DESC')
      .limit(1)
      .getOne();
    const isLastRound = lastRound?.id === round.id;

    if (isLastRound) {
      // Rank the finalists.
      //
      // `winnerTeamId` on a bracket slot is NOT the slot's own team —
      // `stampSlotWinner` writes the MATCH winner onto BOTH slots (one
      // per team perspective) so the FE can render the bracket from
      // either side. So both final slots carry the champion's id and
      // `finalSlots.find(s => s.winnerTeamId)` twice yields the same
      // team. The runner-up has to be derived from the final's actual
      // participants: whichever of home/away is not the champion.
      const finalSlots = await this.slotRepo.find({
        where: { roundId: round.id },
      });

      // The final round has exactly one match; both of its slots
      // point at it. Prefer the slot's match row, and fall back to
      // the slot's own home/away ids if the link is missing.
      const finalMatchId = finalSlots.find((s) => s.matchId)?.matchId;
      const finalMatch = finalMatchId
        ? await this.matchRepo.findOne({ where: { id: finalMatchId } })
        : null;

      const championTeamId: Uuid | null =
        finalMatch && finalMatch.status === MatchStatus.COMPLETED
          ? this.determineWinner(finalMatch)
          : (finalSlots.find((s) => s.winnerTeamId)?.winnerTeamId ?? null);

      const runnerUpTeamId: Uuid | null = finalMatch
        ? ([finalMatch.homeTeamId, finalMatch.awayTeamId].find(
            (teamId) => teamId && teamId !== championTeamId,
          ) as Uuid | undefined) ?? null
        : null;

      if (championTeamId) {
        await this.entryRepo.update(
          { cupId, teamId: championTeamId },
          { finalPosition: 1 },
        );
      }
      if (runnerUpTeamId) {
        await this.entryRepo.update(
          { cupId, teamId: runnerUpTeamId },
          { finalPosition: 2 },
        );
      }

      // Mark the cup completed.
      await this.cupRepo.update(cupId, { status: CupStatus.COMPLETED });
      this.logger.info(
        `[CupProgress] Cup ${cupId} (season ${cup.season}) completed. ` +
          `Champion: team ${championTeamId ?? 'unknown'}, ` +
          `runner-up: team ${runnerUpTeamId ?? 'unknown'}`,
      );
    } else {
      // Not the last round — build the next round's slots.
      const nextRoundNumber = round.roundNumber + 1;
      await this.buildNextRoundSlots(cup, round, nextRoundNumber);
    }

    return true;
  }

  /**
   * Build the bracket slots for the next round from this
   * round's winners + any new tier entries that enter at
   * `nextRoundNumber`. Mirrors `CupGenerator.createRoundZeroSlots`
   * but takes the team pool from the database instead of
   * the live team table.
   */
  private async buildNextRoundSlots(
    cup: CupEntity,
    currentRound: CupRoundEntity,
    nextRoundNumber: number,
  ): Promise<void> {
    // 1. Read the next round's metadata.
    const nextRound = await this.roundRepo.findOne({
      where: { cupId: cup.id, roundNumber: nextRoundNumber },
    });
    if (!nextRound) {
      this.logger.error(
        `[CupProgress] Cup ${cup.id} has no round ${nextRoundNumber} — bracket corrupt?`,
      );
      return;
    }

    // 2. Collect this round's winners. For byes the
    //    winnerTeamId is already set on the slot (cup
    //    generator does this at R0 for entry-round byes).
    const currentSlots = await this.slotRepo.find({
      where: { roundId: currentRound.id },
    });
    const winners = currentSlots
      .filter((s) => s.winnerTeamId)
      .map((s) => s.winnerTeamId as string);

    // 3. Collect new tier entries (if any) at nextRound.
    const newEntries = await this.entryRepo.find({
      where: { cupId: cup.id, entryRound: nextRoundNumber },
    });
    const newTeams = newEntries.map((e) => e.teamId as string);

    // 4. Combined pool. The order doesn't matter for
    //    pure-ELO pairing, but the existing helper
    //    `pairTeamsSeeded` sorts by seedRank then ELO,
    //    so we feed seedRank=0 (treated as "any" — sorts by
    //    ELO) for everyone.
    type SeededLike = { id: string; seedRank: number; elo: number };
    const pool: SeededLike[] = [];
    // ELO snapshot for winners: we need to look up their
    // ELO from the cup_entry.
    const winnerEntries = await this.entryRepo.find({
      where: { teamId: In(winners) },
    });
    const eloByTeamId = new Map<string, number>();
    for (const e of winnerEntries) {
      eloByTeamId.set(e.teamId as string, e.eloSnapshot);
    }
    for (const w of winners) {
      pool.push({
        id: w,
        seedRank: 0,
        elo: eloByTeamId.get(w) ?? 1500,
      });
    }
    for (const e of newEntries) {
      pool.push({
        id: e.teamId as string,
        seedRank: 0,
        elo: e.eloSnapshot,
      });
    }

    // 5. Snake-pair by ELO descending. Inline a tiny
    //    sort-and-pair instead of importing pairTeamsSeeded
    //    (which is designed for within-tier seeding).
    pool.sort((a, b) => b.elo - a.elo);
    const slots: CupBracketSlotEntity[] = [];
    let slotIndex = 0;
    if (pool.length % 2 === 1) {
      // Top team gets a bye.
      const bye = pool.shift()!;
      slots.push(
        this.slotRepo.create({
          cupId: cup.id,
          roundId: nextRound.id,
          roundNumber: nextRoundNumber,
          slotIndex: slotIndex++,
          homeTeamId: bye.id as Uuid,
          awayTeamId: null,
          matchId: null,
          winnerTeamId: bye.id as Uuid, // bye resolves immediately
          sourceSlotId: null,
          isBye: true,
        }),
      );
    }
    for (let i = 0; i < pool.length; i += 2) {
      const home = pool[i];
      const away = pool[i + 1];
      slots.push(
        this.slotRepo.create({
          cupId: cup.id,
          roundId: nextRound.id,
          roundNumber: nextRoundNumber,
          slotIndex: slotIndex++,
          homeTeamId: home.id as Uuid,
          awayTeamId: null,
          matchId: null,
          winnerTeamId: null,
          sourceSlotId: null,
          isBye: false,
        }),
      );
      slots.push(
        this.slotRepo.create({
          cupId: cup.id,
          roundId: nextRound.id,
          roundNumber: nextRoundNumber,
          slotIndex: slotIndex++,
          homeTeamId: null,
          awayTeamId: away.id as Uuid,
          matchId: null,
          winnerTeamId: null,
          sourceSlotId: null,
          isBye: false,
        }),
      );
    }

    await this.slotRepo.save(slots);
    this.logger.info(
      `[CupProgress] Cup ${cup.id} round ${nextRoundNumber}: built ${slots.length} bracket slot(s) from ${winners.length} winner(s) + ${newTeams.length} new entrie(s)`,
    );
  }
}

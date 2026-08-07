import {
  LeagueEntity,
  TeamEntity,
  UserEntity,
  UserOnboardingStatus,
  Uuid,
  ONBOARDING_PENDING_NAME,
  scrubManagerSpecificData,
  generateTeamSquad,
  generateTeamStaff,
  generateTeamFinance,
  generateTeamFan,
  generateTeamStadium,
  seedSeniorScoutCandidate,
} from '../index';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Player-ratio threshold separating the "fill leagues to 50% before
 * moving on" phase from the "round-robin the emptiest league" phase.
 * Mirrors the rule described in the design spec: "每个联赛都填充
 * 一半及以上的玩家，再下一个联赛，最后平铺".
 *
 * Kept as a module-level const so tests can reference it without
 * poking at the service object.
 */
export const PHASE1_FILL_THRESHOLD = 0.5;

/**
 * Pure data shape returned by `OnboardingAssigner.claim` so the
 * caller (the BullMQ worker in settlement, or the API endpoint
 * in a manual-retry path) can log the outcome without needing
 * to know about the worker class.
 */
export interface OnboardingClaimResult {
  team: TeamEntity;
  /** True when a fresh claim was made; false when an existing
   *  ownership was reused (idempotency). */
  reused: boolean;
}

interface LeagueBotStats {
  league: LeagueEntity;
  total: number;
  players: number;
  bots: number;
  playerRatio: number;
}

/**
 * Atomic, framework-agnostic "give this user a BOT team" core.
 *
 * Lives in `@goalxi/database` so both the `api` service
 * (`AuthService.register` / `OnboardingService`) and the
 * `settlement` worker (`OnboardingProcessor`) share the same
 * algorithm and the same DB transaction semantics. The whole
 * "pick league → pick BOT → flip isBot → set user onboarding
 * status" sequence is one unit of work; splitting it across
 * service boundaries would risk the half-claimed state the
 * migration backfill already had to paper over.
 *
 * Allocation policy (matches the original `OnboardingService`):
 *   1. Phase 1 — pick the league with the lowest current
 *      player-vs-total ratio (still under the 50% threshold),
 *      breaking ties by tier ASC + tierDivision ASC. Within
 *      that league, claim the lowest-ELO BOT, tie-break by
 *      createdAt ASC.
 *   2. Phase 2 — once every league with a live roster is past
 *      50%, fall back to "drain the emptiest league" so the
 *      distribution stays even.
 *
 * Concurrency: every state mutation runs inside a single
 * `dataSource.transaction(...)` and the BOT pick uses
 * `pessimistic_write`. Two simultaneous register calls cannot
 * both pass the `isBot=true` check; the second waits for the
 * first to commit, then sees `userId !== null` and throws
 * `OnboardingClaimRaceError`, which BullMQ retries with
 * `attempts: 3, backoff: { type: 'exponential', delay: 1500 }`.
 *
 * Idempotency: if the user already owns a non-BOT team, returns
 * the existing team with `reused: true` and does NOT touch any
 * row. This is what makes the manual retry endpoint safe — a
 * double-click on the "retry" button can never create or
 * overwrite state.
 */
export class OnboardingAssigner {
  /**
   * Pick a BOT team for the given user and atomically transfer
   * it. Returns the team row (existing or newly claimed) plus a
   * `reused` flag for observability.
   *
   * Throws `OnboardingNoBotAvailableError` if no BOT team
   * exists anywhere in the database. In practice that only
   * happens on a fresh, un-bootstrapped DB — the seed script
   * always creates the full league pyramid before any user can
   * register.
   */
  static async claim(
    dataSource: DataSource,
    userId: Uuid,
  ): Promise<OnboardingClaimResult> {
    // Idempotency: reuse an existing ownership without touching it.
    // Done outside the transaction to keep the hot path cheap.
    const existing = await dataSource.manager
      .createQueryBuilder(TeamEntity, 't')
      .where('t.userId = :userId', { userId })
      .andWhere('t.isBot = :isBot', { isBot: false })
      .andWhere('t.deletedAt IS NULL')
      .getOne();
    if (existing) {
      // Make sure the user's status is consistent. We do this
      // even on the reused path so a manually-promoted user
      // (e.g. admin set status to ACTIVE via SQL but team got
      // reassigned) ends up ACTIVE again.
      await dataSource.manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({ onboardingStatus: UserOnboardingStatus.ACTIVE })
        .where('id = :id', { id: userId })
        .execute();
      return { team: existing, reused: true };
    }

    // The pick + claim + scrub + regenerate + user-status-flip
    // all run inside ONE transaction. Two reasons:
    //
    //  1. `pessimistic_write` requires a transaction in
    //     TypeORM/Postgres. Calling `setLock` outside a tx
    //     throws PessimisticLockTransactionRequiredError.
    //  2. We want the pick and the claim to observe a
    //     consistent snapshot — the league ratio we read at
    //     pick time must match the BOT count at claim time.
    //  3. The scrub + squad-regen work needs to be atomic
    //     with the claim itself: a crash mid-scrub would
    //     leave the new manager with a half-cleared BOT
    //     roster, and a crash mid-regen would leave a team
    //     with zero players. Both are unacceptable mid-season.
    return dataSource.transaction(async (manager) => {
      const target = await this.pickAndLockInTransaction(manager);
      if (!target) {
        // Let the caller decide how to handle this. The
        // settlement worker treats it as a fatal retry (no
        // point retrying immediately if there's literally
        // nothing to claim), so we throw a recognisable error
        // type.
        throw new OnboardingNoBotAvailableError(
          'No BOT team available for assignment — bootstrap may be incomplete',
        );
      }
      // Re-fetch under the same lock the pick just took, so
      // the team we mutate is the team we picked (a concurrent
      // claim could have already grabbed it between pick and
      // now if a different worker bypassed our lock — paranoid
      // check for correctness).
      //
      // `isBot = true` is the only authoritative "this is still
      // a BOT" check — `userId` is non-null on every BOT row
      // because the seed-time TeamGenerator writes
      // `userId = <bot-manager-id>`. We deliberately do NOT
      // also check `userId !== null` here.
      const fresh = await manager
        .createQueryBuilder(TeamEntity, 't')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: target.id })
        .getOne();
      if (!fresh || !fresh.isBot) {
        throw new OnboardingClaimRaceError(
          'Target BOT team is no longer available — please retry',
        );
      }

      // Step 1 — flip the team row from BOT to user-owned.
      // `teamId` is preserved (the new manager inherits the
      // BOT's `teamId`, league, jersey colors, etc.) so season
      // rows like `match` / `match_event` / `league_standing`
      // stay correctly linked. The name is overwritten with
      // the `ONBOARDING_PENDING_NAME` sentinel so the
      // frontend's `/onboarding/select` page knows to render
      // the "name your club" form on this manager's FIRST
      // visit only — see the comment on that constant in
      // `team-onboarding-generator.ts` for the full rationale.
      fresh.userId = userId;
      fresh.isBot = false;
      // botLevel was a BOT-specific knob; reset to the player
      // default so any future read doesn't see a stale 5.
      fresh.botLevel = 5;
      fresh.name = ONBOARDING_PENDING_NAME;
      await manager.save(fresh);

      // Step 2 — wipe every manager-controlled row off the
      // team. Players are soft-deleted (so `match_event`'s
      // CASCADE FKs stay valid for season-history queries);
      // the rest are hard-deleted because nothing historical
      // references them. See `team-onboarding-generator.ts`
      // for the per-table rationale.
      await scrubManagerSpecificData(manager, fresh.id);

      // Step 3 — generate the new manager's starter squad
      // (18 fresh players, random skills, random names pinned
      // to the team's nationality), the default coaching staff
      // (head coach + fitness coach), the starting financial
      // balance, the zero-fan base, and the starter stadium.
      // All happen inside this same transaction so a rollback
      // restores the BOT state and the league ratio stays
      // consistent. See `team-onboarding-generator.ts` for
      // the seed values (`ONBOARDING_STARTING_BALANCE` etc.).
      await generateTeamSquad(manager, fresh.id, fresh.nationality);
      await generateTeamStaff(manager, fresh.id, fresh.nationality);
      await generateTeamFinance(manager, fresh.id);
      await generateTeamFan(manager, fresh.id);
      await generateTeamStadium(manager, fresh.id);

      // Step 4 — seed one scout candidate so the new manager
      // has something to look at in the inbox without waiting
      // for the Saturday cron. Best-effort: if generation
      // throws, the claim still succeeds (the manager can
      // still hit "draw" on day 1 — the per-week cap is the
      // gate, not the seed).
      try {
        await seedSeniorScoutCandidate(manager, fresh.id, fresh.nationality);
      } catch {
        // Swallow — the claim is the load-bearing write. The
        // settlement processor's existing warn-level log
        // covers the failure; we just don't want a bad
        // random roll to bounce the user back to TEAMLESS.
      }

      // Step 5 — flip onboarding status in the same
      // transaction so a crash between the writes can't leave
      // the user owning a team but still flagged TEAMLESS.
      await manager
        .createQueryBuilder()
        .update(UserEntity)
        .set({ onboardingStatus: UserOnboardingStatus.ACTIVE })
        .where('id = :id', { id: userId })
        .execute();

      return { team: fresh, reused: false };
    });
  }

  /**
   * Mark the user's onboarding status as PROCESSING. Called by
   * the BullMQ worker right before it starts the claim so the
   * frontend's polling endpoint reflects "work in flight"
   * instead of the original "TEAMLESS, no job yet" state.
   *
   * Idempotent: re-running this is a no-op when the user is
   * already in PROCESSING (so a BullMQ retry doesn't bounce the
   * UI between states).
   */
  static async markProcessing(
    dataSource: DataSource,
    userId: Uuid,
  ): Promise<void> {
    await dataSource.manager
      .createQueryBuilder()
      .update(UserEntity)
      .set({ onboardingStatus: UserOnboardingStatus.PROCESSING })
      .where('id = :id', { id: userId })
      .andWhere('onboardingStatus != :active', {
        active: UserOnboardingStatus.ACTIVE,
      })
      .execute();
  }

  // ---------------- internals ----------------

  /**
   * Pick the league that needs a player next, then lock the
   * lowest-ELO BOT inside that league. Returns the locked
   * team row or `null` if every league is full of players.
   *
   * Must be called from inside a `dataSource.transaction(...)`
   * because the lock is `pessimistic_write` and Postgres
   * refuses that without an open transaction.
   */
  private static async pickAndLockInTransaction(
    manager: EntityManager,
  ): Promise<TeamEntity | null> {
    // Aggregate per-league totals in one round-trip. The query
    // works for any number of leagues; 85 leagues (the full
    // pyramid) is small enough that the GROUP BY is essentially
    // free.
    const rows: Array<{
      leagueId: string;
      total: string;
      players: string;
    }> = await manager
      .createQueryBuilder(TeamEntity, 't')
      .select('t.leagueId', 'leagueId')
      .addSelect('COUNT(*)::int', 'total')
      .addSelect(
        "SUM(CASE WHEN t.is_bot = false THEN 1 ELSE 0 END)::int",
        'players',
      )
      .where('t.leagueId IS NOT NULL')
      .andWhere('t.deletedAt IS NULL')
      .groupBy('t.leagueId')
      .getRawMany();

    if (rows.length === 0) {
      return null;
    }

    // Pull the league metadata in one go (avoids N+1 against the
    // league table).
    const leagueIds = rows.map((r) => r.leagueId);
    const leagues = await manager
      .createQueryBuilder(LeagueEntity, 'l')
      .where('l.id IN (:...ids)', { ids: leagueIds })
      .orderBy('l.tier', 'ASC')
      .addOrderBy('l.tierDivision', 'ASC')
      .getMany();
    const leagueById = new Map(leagues.map((l) => [l.id, l]));

    const stats: LeagueBotStats[] = rows
      .map((r) => {
        // `LeagueEntity.id` is the branded `Uuid` type while
        // `r.leagueId` from the raw query is a plain `string`.
        // The brand is structural — Uuid IS a string at runtime
        // — so the cast is safe and we don't need to plumb
        // generics through the Map.
        const league = leagueById.get(r.leagueId as Uuid);
        if (!league) return null;
        const total = Number(r.total);
        const players = Number(r.players);
        return {
          league,
          total,
          players,
          bots: total - players,
          playerRatio: total === 0 ? 0 : players / total,
        };
      })
      .filter((s): s is LeagueBotStats => s !== null);

    const chosen = this.chooseLeague(stats);
    if (!chosen) return null;

    // Lock the chosen BOT row so concurrent claims can't both
    // pass the isBot check. The lock is released when the
    // enclosing transaction commits.
    //
    // We filter on `isBot = true` alone — NOT `userId IS NULL`
    // — because the bootstrap `TeamGenerator` writes every BOT
    // with `userId = <bot-manager-user-id>`. That seed-time
    // assignment doesn't make the team "owned" by a manager;
    // `isBot = true` is the only authoritative flag. Once a
    // claim succeeds we flip both `isBot = false` and `userId =
    // <new-manager-id>` in the same transaction below.
    return manager
      .createQueryBuilder(TeamEntity, 't')
      .setLock('pessimistic_write')
      .where('t.leagueId = :leagueId', { leagueId: chosen.league.id })
      .andWhere('t.isBot = :isBot', { isBot: true })
      .andWhere('t.deletedAt IS NULL')
      .orderBy('t.eloRating', 'ASC')
      .addOrderBy('t.createdAt', 'ASC')
      .getOne();
  }

  private static chooseLeague(
    stats: LeagueBotStats[],
  ): LeagueBotStats | null {
    const withBots = stats.filter((s) => s.bots > 0);
    if (withBots.length === 0) return null;

    // Restrict the entire choice to the bottom (highest-tier
    // number) tier present in the database. The intent is:
    // every new manager starts in the lowest division of the
    // pyramid. Top-tier leagues stay BOT-only (i.e. "computer
    // opponents for the top of the league table") until the
    // admin explicitly promotes a team up the ladder.
    //
    // The number is computed from the live stats — not from a
    // hard-coded "4" or similar — so the algorithm keeps
    // working if a future environment ships a different shape
    // (e.g. L1 + L2 + L3 + L4 → only L4 is fair game for new
    // managers).
    const bottomTier = Math.max(...withBots.map((s) => s.league.tier));
    const bottomTierStats = withBots.filter(
      (s) => s.league.tier === bottomTier,
    );
    if (bottomTierStats.length === 0) return null;

    // Phase 1: among bottom-tier leagues, pick the one with
    // the lowest player-vs-total ratio (still under the 50%
    // threshold). Tie-break by tierDivision ASC so we drain
    // the divisions of the bottom tier in order.
    const phase1 = bottomTierStats.filter(
      (s) => s.playerRatio < PHASE1_FILL_THRESHOLD,
    );
    if (phase1.length > 0) {
      phase1.sort((a, b) => {
        if (a.playerRatio !== b.playerRatio) {
          return a.playerRatio - b.playerRatio;
        }
        return a.league.tierDivision - b.league.tierDivision;
      });
      return phase1[0];
    }

    // Phase 2: round-robin among bottom-tier leagues. Pick the
    // one with the most remaining BOTs; tie-break by
    // tierDivision ASC for determinism.
    return [...bottomTierStats].sort((a, b) => {
      if (a.bots !== b.bots) return b.bots - a.bots;
      return a.league.tierDivision - b.league.tierDivision;
    })[0];
  }
}

/**
 * Thrown by `OnboardingAssigner.claim` when there is no BOT team
 * available at all. BullMQ treats this as a permanent failure
 * (no retry) — see `OnboardingProcessor` for the matching
 * `failedPermanentReason` handling.
 */
export class OnboardingNoBotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingNoBotAvailableError';
  }
}

/**
 * Thrown by `OnboardingAssigner.claim` when the picked BOT team
 * was claimed by a concurrent worker between the pick and the
 * claim. The BullMQ worker catches this and retries the job
 * (attempts: 3 is set on the queue).
 */
export class OnboardingClaimRaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingClaimRaceError';
  }
}

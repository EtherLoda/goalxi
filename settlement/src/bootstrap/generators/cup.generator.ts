import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CupBracketSlotEntity,
  CupEntity,
  CupEntryEntity,
  CupRoundEntity,
  CupRoundKind,
  CupRoundStatus,
  CupStatus,
  CupTierInput,
  GAME_SETTINGS,
  LeagueEntity,
  TeamEntity,
  calculateEntryRounds,
  pairTeamsSeeded,
  simulateBracket,
} from '@goalxi/database';

/**
 * Bootstraps one National Cup per season. The MVP only knows
 * one cup type (`NATIONAL`); future cups (SENIOR / TROPHY /
 * VASE) reuse the same code path with a different `type` arg.
 *
 * ## Idempotency
 *
 * `generateCupForSeason(season)` checks the `cup(season, type)`
 * unique index — re-running on an already-bootstrapped season
 * is a no-op. Same pattern the other generators (schedule,
 * announcement) use.
 *
 * ## What this writes
 *
 *   - 1 `cup` row
 *   - N `cup_round` rows (one per round, e.g. 12 for L1-L4)
 *   - M `cup_entry` rows (one per team, e.g. 1360 for L1-L4)
 *   - K `cup_bracket_slot` rows for round 0 only (1024 for
 *     L1-L4 — the rest are created by the progress worker
 *     when prior rounds complete)
 *
 * The actual `match` rows for R0 are NOT written here — the
 * cup scheduler (Phase 3) is responsible for materializing
 * matches from the bracket slots, in the same way the league
 * scheduler materializes matches from the round-robin generator.
 */
@Injectable()
export class CupGenerator {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(CupEntity)
    private readonly cupRepo: Repository<CupEntity>,
    @InjectRepository(CupRoundEntity)
    private readonly roundRepo: Repository<CupRoundEntity>,
    @InjectRepository(CupEntryEntity)
    private readonly entryRepo: Repository<CupEntryEntity>,
    @InjectRepository(CupBracketSlotEntity)
    private readonly slotRepo: Repository<CupBracketSlotEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepo: Repository<LeagueEntity>,
  ) {}

  /**
   * Generate the National Cup for `season`. No-op if a cup with
   * `(season, NATIONAL)` already exists. The `initDate` (when
   * provided) is used as the season anchor — round 0 of the cup
   * kicks off on `initDate + 1 week` at `GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC`,
   * round 1 on `initDate + 2 weeks`, and so on. The init date
   * is optional so the auto-recover `BootstrapService` can
   * still call this without it — in that case round 0's
   * scheduledAt is left NULL and the `CupSchedulerService`
   * back-fills it on the first tick that finds the round.
   */
  async generateCupForSeason(season: number, initDate?: Date): Promise<void> {
    const existing = await this.cupRepo.findOne({
      where: { season, type: 'NATIONAL' },
    });
    if (existing) {
      this.logger.info(
        `[CupGenerator] National Cup for season ${season} already exists (id=${existing.id}), skipping`,
      );
      return;
    }

    this.logger.info(
      `[CupGenerator] Building National Cup for season ${season}...`,
    );

    // 1. Count teams per tier. Derive the tier list from the live
    //    league + team data so adding L5/L6 later is automatic.
    const tierInputs = await this.collectTiersFromDatabase();
    if (tierInputs.length === 0) {
      this.logger.warn(
        '[CupGenerator] No leagues found in DB, cannot create cup. ' +
          'Run LeagueGenerator first.',
      );
      return;
    }

    const structure = calculateEntryRounds(tierInputs);
    this.logger.info(
      `[CupGenerator] Cup structure: ${tierInputs.length} tiers, ` +
        `${structure.totalRounds} total rounds. Entries: ` +
        structure.entries
          .map((e) => `L${e.tier}=R${e.entryRound}(${e.teamCount})`)
          .join(', '),
    );

    // 2. Create the cup row.
    const cup = await this.cupRepo.save(
      this.cupRepo.create({
        season,
        type: 'NATIONAL',
        name: `National Cup ${season}`,
        status: CupStatus.PENDING,
        prizeCurrency: 'CNY',
        prizePool: '0',
      }),
    );
    this.logger.info(`[CupGenerator] Created cup id=${cup.id}`);

    // 3. Create one cup_round row per round. Rounds 0..N-2 are
    //    "qualifying" or "proper" depending on whether the round
    //    is past the last entry round; the last two rounds are
    //    "knockout" + "final".
    const rounds = await this.createRounds(cup.id, structure, initDate);
    this.logger.info(`[CupGenerator] Created ${rounds.length} cup_round rows`);

    // 4. Create one cup_entry row per team, with seed_rank assigned
    //    within tier by ELO (descending = top seed = seedRank 1).
    const entriesByTeamId = await this.createEntries(cup.id, structure);
    this.logger.info(
      `[CupGenerator] Created ${Object.keys(entriesByTeamId).length} cup_entry rows`,
    );

    // 5. Create round-0 bracket slots. Subsequent rounds are
    //    built by the progress worker when prior rounds complete
    //    (Phase 3).
    const r0Round = rounds[0];
    const r0Slots = await this.createRoundZeroSlots(
      cup.id,
      r0Round,
      entriesByTeamId,
    );
    this.logger.info(`[CupGenerator] Created ${r0Slots} round-0 bracket slots`);

    this.logger.info(
      `[CupGenerator] National Cup season ${season} generation complete`,
    );
  }

  /**
   * Query the live database for tier counts. Tiers are derived
   * from `league.tier` (1 = top), grouped across all tier_divisions
   * at the same tier level. Returns 0-team tiers? — no, a tier
   * with no teams is dropped (otherwise it would force byes for
   * an entire tier worth of empty slots).
   */
  private async collectTiersFromDatabase(): Promise<CupTierInput[]> {
    const leagues = await this.leagueRepo.find();
    const tierSet = new Set<number>();
    for (const l of leagues) tierSet.add(l.tier);
    const tiers: CupTierInput[] = [];
    for (const tier of [...tierSet].sort((a, b) => a - b)) {
      const teamCount = await this.teamRepo
        .createQueryBuilder('team')
        .innerJoin('team.league', 'league')
        .where('league.tier = :tier', { tier })
        .getCount();
      if (teamCount === 0) continue;
      tiers.push({ tier, teamCount });
    }
    return tiers;
  }

  /**
   * Insert one cup_round row per round in the structure. Round
   * kind is derived from the round number vs entry rounds:
   *   - rounds 0..lastEntryRound  → QUALIFYING (entries arrive)
   *   - rounds lastEntryRound+1..N-2 → KNOCKOUT (no new entries)
   *   - round N-1                  → FINAL
   * "PROPER" is reserved for rounds where a NEW tier enters but
   * the round is past the qualifying stage (L1 entering R6 in
   * the L1-L4 MVP — but R6 is still QUALIFYING by the rule above
   * because it's the round where the last entry happens). The
   * PROPER enum value is kept for future cups where this might
   * differ (e.g. an L1-only Senior Cup where every round is PROPER).
   */
  private async createRounds(
    cupId: string,
    structure: ReturnType<typeof calculateEntryRounds>,
    initDate?: Date,
  ): Promise<CupRoundEntity[]> {
    const lastEntryRound = Math.max(
      ...structure.entries.map((e) => e.entryRound),
    );
    const totalRounds = structure.totalRounds;
    const rows: CupRoundEntity[] = [];
    for (let r = 0; r < totalRounds; r++) {
      let kind: CupRoundKind;
      if (r === totalRounds - 1) {
        kind = CupRoundKind.FINAL;
      } else if (r > lastEntryRound) {
        kind = CupRoundKind.KNOCKOUT;
      } else {
        kind = CupRoundKind.QUALIFYING;
      }
      // Each round kicks off 1 week after the previous one.
      // The first round (R0) is `initDate + 7 days` so it lands
      // a full week after the league's first matchday — gives
      // the user a clean "this is the cup weekend" feeling.
      // `scheduledAt` is set at GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC
      // (= 6:00 UTC = 14:00 China time) so the cup uses the
      // same kickoff hour as the league (shared constant — see
      // commit 96bc4b5).
      let scheduledAt: Date | null = null;
      if (initDate) {
        const startOfUtcDay = (d: Date) =>
          new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
          );
        const base = startOfUtcDay(initDate);
        scheduledAt = new Date(
          base.getTime() + (r + 1) * 7 * 24 * 60 * 60 * 1000,
        );
        scheduledAt.setUTCHours(GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC, 0, 0, 0);
      }
      rows.push(
        this.roundRepo.create({
          cupId,
          roundNumber: r,
          roundName: this.roundDisplayName(r, totalRounds),
          kind,
          status: CupRoundStatus.PENDING,
          slotCount: 0,
          tacticsDeadline: null,
          scheduledAt,
        }),
      );
    }
    return this.roundRepo.save(rows);
  }

  /**
   * Display name for a round. Follows the FA Cup convention:
   *   R0 = "Pre-Qualifying"
   *   R1..Rn = "Qualifying Rk" until entries stabilize
   *   Then "R1 Proper" → "R2 Proper" → ... → "R5 (QF)" → "SF" → "Final"
   * The exact labels are cosmetic — the FE can rebadge them — but
   * we ship sensible defaults so the API responses are useful out
   * of the box.
   */
  private roundDisplayName(round: number, totalRounds: number): string {
    if (round === 0) return 'Pre-Qualifying';
    if (round === totalRounds - 1) return 'Final';
    if (round === totalRounds - 2) return 'Semi-Final';
    if (round === totalRounds - 3) return 'Quarter-Final';
    if (round < 4) return `Qualifying R${round}`;
    const properRound = round - 3; // 0-indexed "R1 Proper" starts after the qualifying stretch
    return `R${properRound + 1} Proper`;
  }

  /**
   * Build one cup_entry row per team. Seed ranks are assigned
   * within tier (top ELO = seedRank 1, etc.). The ELO is
   * snapshotted into `elo_snapshot` so the progress worker can
   * resolve the cross-tier matches without re-querying the live
   * team ELO (which drifts over the season).
   *
   * Returns a Map<teamId, CupEntryEntity> for the bracket-slot
   * step that follows.
   */
  private async createEntries(
    cupId: string,
    structure: ReturnType<typeof calculateEntryRounds>,
  ): Promise<Record<string, CupEntryEntity>> {
    const entries: CupEntryEntity[] = [];
    const result: Record<string, CupEntryEntity> = {};

    for (const tierInfo of structure.entries) {
      // Fetch all teams in this tier with their league metadata
      // so we can stamp source_league_id on each entry. Eager-
      // loading the league is the simplest path — for a 16-team
      // L1 (the smallest tier) the row count is trivial.
      const teams = await this.teamRepo
        .createQueryBuilder('team')
        .innerJoinAndSelect('team.league', 'league')
        .where('league.tier = :tier', { tier: tierInfo.tier })
        .orderBy('team.elo_rating', 'DESC')
        .getMany();

      teams.forEach((team, idx) => {
        const entry = this.entryRepo.create({
          cupId,
          teamId: team.id,
          entryRound: tierInfo.entryRound,
          sourceLeagueId: team.leagueId,
          tier: tierInfo.tier,
          seedRank: idx + 1, // 1 = top seed
          eloSnapshot: team.eloRating ?? 1500,
          eliminatedInRound: null,
          finalPosition: null,
        });
        entries.push(entry);
        result[team.id] = entry;
      });
    }

    await this.entryRepo.save(entries);
    return result;
  }

  /**
   * Build round-0 bracket slots. For the L1-L4 MVP this is
   * 1024 L4 teams → 512 matches. Top-seeded teams get home.
   * The bracket pairs (1 vs 1024, 2 vs 1023, ..., 512 vs 513)
   * which mirrors the FA Cup / March Madness "snake" draw.
   *
   * Subsequent rounds (R1..RN) are created by the progress
   * worker once R0 completes — that worker is Phase 3.
   */
  private async createRoundZeroSlots(
    cupId: string,
    r0Round: CupRoundEntity,
    entriesByTeamId: Record<string, CupEntryEntity>,
  ): Promise<number> {
    // Filter to teams entering at round 0 only.
    const r0Entries = Object.values(entriesByTeamId).filter(
      (e) => e.entryRound === 0,
    );
    if (r0Entries.length === 0) {
      return 0;
    }

    const seeded = r0Entries.map((e) => ({
      id: e.teamId,
      seedRank: e.seedRank,
      elo: e.eloSnapshot,
    }));
    const pairing = pairTeamsSeeded(seeded);

    const slots: CupBracketSlotEntity[] = [];
    pairing.byes.forEach((bye) => {
      slots.push(
        this.slotRepo.create({
          cupId,
          roundId: r0Round.id,
          roundNumber: 0,
          slotIndex: slots.length,
          homeTeamId: bye.id,
          awayTeamId: null,
          matchId: null,
          winnerTeamId: bye.id, // bye resolves immediately
          sourceSlotId: null,
          isBye: true,
        }),
      );
    });
    pairing.pairs.forEach((pair) => {
      // pair.homeTeam is the better seed; mark them as home.
      const home = pair.homeTeam.id;
      const away = pair.awayTeam.id;
      // Two slots per match: one for home, one for away. Each
      // slot still references the same match when it's created
      // (Phase 3) — for now we just record the pairing.
      slots.push(
        this.slotRepo.create({
          cupId,
          roundId: r0Round.id,
          roundNumber: 0,
          slotIndex: slots.length,
          homeTeamId: home,
          awayTeamId: null, // Filled in by Phase 3 when match row is created
          matchId: null,
          winnerTeamId: null,
          sourceSlotId: null,
          isBye: false,
        }),
      );
      slots.push(
        this.slotRepo.create({
          cupId,
          roundId: r0Round.id,
          roundNumber: 0,
          slotIndex: slots.length,
          homeTeamId: null,
          awayTeamId: away,
          matchId: null,
          winnerTeamId: null,
          sourceSlotId: null,
          isBye: false,
        }),
      );
    });

    await this.slotRepo.save(slots);
    // Update the round's slotCount to reflect what we just wrote.
    await this.roundRepo.update(r0Round.id, { slotCount: slots.length });
    return slots.length;
  }

  /**
   * Expose the bracket progression for the most recent cup of
   * `season`. Useful for the progress worker (Phase 3) and for
   * API responses that want to render the round list without
   * recomputing it.
   */
  async getBracketProgression(season: number) {
    const cup = await this.cupRepo.findOne({
      where: { season, type: 'NATIONAL' },
    });
    if (!cup) return null;
    const tierInputs: CupTierInput[] = (
      await this.entryRepo
        .createQueryBuilder('entry')
        .select('entry.tier', 'tier')
        .addSelect('COUNT(*)', 'teamCount')
        .addSelect('MIN(entry.entry_round)', 'entryRound')
        .where('entry.cup_id = :cupId', { cupId: cup.id })
        .groupBy('entry.tier')
        .getRawMany()
    ).map((r) => ({
      tier: parseInt(r.tier, 10),
      teamCount: parseInt(r.teamCount, 10),
    }));
    if (tierInputs.length === 0) return null;
    const structure = calculateEntryRounds(tierInputs);
    return simulateBracket(structure);
  }
}

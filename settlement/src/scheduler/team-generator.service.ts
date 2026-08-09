import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import {
  TeamEntity,
  createTeam,
  generateUniqueShortCode,
} from '@goalxi/database';
import type { CreatedTeam, CreateTeamParams } from '@goalxi/database';

/**
 * Thin pass-through to the shared `@goalxi/database` `createTeam`.
 *
 * History: this class used to embed its own squad / skill / name /
 * age generators and a tier-aware OVR range. That logic is now
 * consolidated in `team-onboarding-generator.ts` so a manager's
 * first squad, a bot at season init, and a future "promote a
 * fresh bot up the pyramid" flow all produce identical 16-player,
 * 25-40 OVR, v2-specialty rosters. The only differences are the
 * `isBot` flag, the owning `userId`, the bot strength, and the
 * starting balance / fans.
 *
 * What stays here:
 *   - The two public entry points (`generateTeam` returns the
 *     payload, `createTeam` persists it) so existing call sites
 *     that took a dependency on this service's signature still
 *     work.
 *   - The 5-tier position distribution comment (the 16-player
 *     layout lives in the shared module).
 *   - The unique `shortCode` pre-generation, since the team row
 *     has a DB-level UNIQUE constraint on `shortCode` that the
 *     shared function can't side-step.
 *
 * Reserved-for-future: scheduled calls to "add a fresh bot" when
 * the pyramid gets a new opening (e.g. after a manager leaves and
 * the admin wants to backfill their slot). Until that lands, this
 * service is dead code at runtime — but kept as the canonical
 * scheduler entry point so adding a real caller is a one-line
 * change.
 */
@Injectable()
export class TeamGeneratorService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Build the createTeam params from a high-level "league tier"
   * request. The shared `createTeam` doesn't care about league
   * tiers (it just stamps `leagueId`) — but callers that think
   * in "tier N bot" need a single thing to call. We resolve the
   * tier to a concrete league by `LIMIT 1` since the scheduler
   * only ever creates one bot per call.
   */
  async generateTeam(
    leagueId: string,
    teamName?: string,
    isBot = true,
    botLevel = 5,
  ): Promise<{ params: CreateTeamParams }> {
    const name = teamName ?? this.generateTeamName();
    const shortCode = await generateUniqueShortCode(async (code) => {
      const taken = await this.dataSource.manager.findOne(TeamEntity, {
        where: { shortCode: code },
      });
      return taken !== null;
    });
    return {
      params: {
        leagueId: leagueId as CreateTeamParams['leagueId'],
        name,
        nationality: 'CN',
        isBot,
        botLevel,
        userId: isBot ? 'system' : 'system',
        shortCode,
      },
    };
  }

  /**
   * Persist a new team via the shared `createTeam`. Returns the
   * full created payload (team row + players + staff) so the
   * caller (when one exists) can log the outcome or attach the
   * generated players to other entities.
   */
  async createTeam(params: CreateTeamParams): Promise<CreatedTeam> {
    const created = await createTeam(this.dataSource.manager, params);
    this.logger.info(
      `[TeamGeneratorService] Created team "${created.team.name}" with ${created.players.length} players`,
    );
    return created;
  }

  /**
   * Simple placeholder name generator. Replaced with the
   * tier-aware city-based names in the bootstrap generator; the
   * scheduler only needs *something* to pass when no name is
   * supplied (rare — most callers name the team explicitly).
   */
  private generateTeamName(): string {
    const cities = ['North', 'South', 'East', 'West', 'Central'];
    const names = ['Wolves', 'Eagles', 'Lions', 'Tigers', 'Bears'];
    return `${cities[Math.floor(Math.random() * cities.length)]} ${names[Math.floor(Math.random() * names.length)]}`;
  }
}

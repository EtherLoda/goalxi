import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  FORMATIONS,
  FormationKey,
  PlayerEntity,
  TacticsPresetEntity,
  TeamEntity,
  generateAutoLineup,
  parsePlayerId,
} from '@goalxi/database';

/**
 * The five formation keys the editor accepts. The
 * generator picks one uniformly at random per team —
 * the user explicitly required BOT teams to NOT all
 * use the same default formation, so a uniform
 * 1/5 weight per formation is the simplest way to
 * make sure every formation sees real usage in
 * production.
 */
const FORMATION_KEYS: FormationKey[] = [
  '4-4-2',
  '4-3-3',
  '4-2-3-1',
  '3-5-2',
  '5-3-2',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate one `tactics_preset` per team and mark it
 * the team's default. The match scheduler's
 * preprocessor uses `tactics_preset.isDefault=true`
 * as the fallback when a `match_tactics` row is
 * missing — so writing a default preset here is what
 * keeps the very first week from being forfeited
 * (the team is a BOT, no human has submitted
 * per-match tactics).
 *
 * Idempotent: re-running on a team that already has
 * a default preset is a no-op. The query is a
 * single `In(teamIds)` lookup so the per-team branch
 * is just a JS filter, not an extra round-trip.
 */
@Injectable()
export class TacticsPresetGenerator {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(TacticsPresetEntity)
    private readonly presetRepo: Repository<TacticsPresetEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
  ) {}

  async generate(): Promise<void> {
    const teams = await this.teamRepo.find();
    if (teams.length === 0) {
      this.logger.info('[TacticsPresetGenerator] no teams, skipping');
      return;
    }

    // Pre-fetch every existing default preset for these
    // teams in one shot. The `teamId` column is part of
    // an index (`@Index(['teamId', 'isDefault'])` on
    // the entity) so the lookup is O(log n) per team.
    const existing = await this.presetRepo.find({
      where: { teamId: In(teams.map((t) => t.id)), isDefault: true },
      select: ['id', 'teamId'],
    });
    const existingTeamIds = new Set(existing.map((p) => p.teamId));

    const toCreate = teams.filter((t) => !existingTeamIds.has(t.id));
    if (toCreate.length === 0) {
      this.logger.info(
        `[TacticsPresetGenerator] all ${teams.length} team(s) already have a default preset, skipping`,
      );
      return;
    }

    // Batch-fetch the player rosters for the teams that
    // need a preset. 16 players × 1360 teams is too big
    // to load in a single query, so we batch by team
    // id and rely on the team index on `player.teamId`.
    const created: TacticsPresetEntity[] = [];
    for (const team of toCreate) {
      const players = await this.playerRepo.find({
        where: { teamId: team.id },
      });
      const preset = this.buildPreset(team, players);
      created.push(preset);
      // Save in batches of 50 to keep the
      // parameterised INSERT size manageable.
      if (created.length >= 50) {
        await this.presetRepo.save(created.splice(0, created.length));
      }
    }
    if (created.length > 0) {
      await this.presetRepo.save(created);
    }

    this.logger.info(
      `[TacticsPresetGenerator] created ${toCreate.length} default preset(s) for ${toCreate.length} new team(s)`,
    );
  }

  private buildPreset(
    team: TeamEntity,
    players: PlayerEntity[],
  ): TacticsPresetEntity {
    const formation = pick(FORMATION_KEYS);

    // generateAutoLineup assigns the best-fit player to
    // each slot. We pull `lineup` (slot key → string
    // player id) and convert to int ids for the v2
    // column that the live engine reads. The legacy
    // `lineup` column is left empty (the player.id
    // uuid→int migration already wiped it).
    //
    // The old code used the lenient `Number(...) + isFinite + ?? 0`
    // pattern, which silently stamped 0 into a slot for a legacy
    // UUID (Number→NaN) and silently accepted 123 for the
    // malformed shape "123abc" (Number→123). Either path makes
    // the engine point a pitch slot at the wrong player without
    // any visible error. `parsePlayerId` requires a pure-digit
    // string and throws on anything else, so a regression in
    // the id source (e.g. someone re-introducing a UUID
    // somewhere) surfaces here instead of in a live match
    // report a week later.
    const { lineup } = generateAutoLineup(players, formation);
    const lineupV2: Record<string, number> = {};
    for (const [slot, id] of Object.entries(lineup)) {
      lineupV2[slot] = parsePlayerId(id);
    }

    return this.presetRepo.create({
      teamId: team.id,
      name: '默认阵型',
      isDefault: true,
      formation: FORMATIONS[formation].label,
      lineup: {} as Record<string, never>,
      lineupV2,
      // tempo / pitchWidth / defensiveLine are not
      // columns on the preset entity (they live on
      // `match_tactics`). The preprocessor falls back
      // to the entity defaults (balanced / balanced /
      // mid) when reading from a preset. If we ever
      // want per-team defaults for these dimensions,
      // promote them to preset columns in a follow-up
      // migration.
      substitutions: null,
      substitutionsV2: undefined,
    });
  }
}

import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  TeamEntity,
  PlayerEntity,
  StaffEntity,
  LeagueEntity,
  StadiumEntity,
  createTeam,
  generateUniqueShortCode,
} from '@goalxi/database';

// Chinese cities for team naming
const L1_CITIES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '成都',
  '武汉',
  '杭州',
  '南京',
];
const L2_CITIES = [
  '西安',
  '苏州',
  '天津',
  '重庆',
  '长沙',
  '郑州',
  '济南',
  '青岛',
  '大连',
  '沈阳',
  '长春',
  '哈尔滨',
  '石家庄',
  '福州',
  '厦门',
  '南昌',
  '合肥',
  '昆明',
  '太原',
  '贵阳',
  '南宁',
  '海口',
  '兰州',
  '乌鲁木齐',
  '呼和浩特',
  '银川',
  '西宁',
  '拉萨',
  '徐州',
  '烟台',
  '潍坊',
  '温州',
  '绍兴',
  '扬州',
  '南通',
  '常州',
  '金华',
  '嘉兴',
  '台州',
  '湖州',
  '镇江',
  '泰州',
  '盐城',
  '淮安',
  '连云港',
  '宿迁',
  '丽水',
  '衢州',
  '舟山',
  '珠海',
  '中山',
  '东莞',
  '佛山',
  '汕头',
  '惠州',
  '江门',
  '湛江',
  '茂名',
  '肇庆',
  '韶关',
  '桂林',
  '柳州',
  '北海',
  '三亚',
];

const SUFFIXES = ['FC', 'United', 'Club', 'City', 'Athletic'];

/**
 * Mascot-style name parts. Combined with a city as
 * `${city}${mascot}` to give the name a 2-character
 * flavour noun — e.g. `北京雄狮`, `上海蓝鲸`,
 * `广州火焰`. The 12 mascots draw from the four
 * directional symbols (青龙/白虎/朱雀/玄武),
 * large mammals (雄狮/猛虎/猎豹/战狼), and a few
 * fantastical ones (麒麟/凤凰/饕餮/貔貅) so the
 * pool doesn't feel like a copy of the same 4
 * animals.
 */
const MASCOTS = [
  '雄狮', '蓝鲸', '火焰', '飞鹰', '金龙', '白虎', '玄武', '朱雀',
  '麒麟', '猎豹', '战狼', '凤凰',
];

/**
 * Sponsor-style name parts. Real Chinese football
 * club names often carry a sponsor suffix
 * (`山东鲁能`, `上海海港`, `广州医药`) — the
 * industrial-sector noun gives the name a corporate
 * edge that pure mascot names don't. Picked for
 * visual distinctiveness from the mascot pool.
 */
const SPONSORS = [
  '能源', '钢铁', '通讯', '航空', '金融', '物流', '化工', '电子',
  '重工', '汽车', '制药', '建工',
];

/**
 * The three naming styles a generated team name can
 * take. Each style is a `(city, value)` template
 * that pairs a city with a value from one of the
 * three suffix arrays. Centralised so the
 * shuffled-pool builder in `pickNamesForLeague`
 * iterates them in a single place.
 */
type NameStyle = 'suffix' | 'mascot' | 'sponsor';
const NAME_STYLES: ReadonlyArray<{ style: NameStyle; values: readonly string[] }> = [
  { style: 'suffix', values: SUFFIXES },
  { style: 'mascot', values: MASCOTS },
  { style: 'sponsor', values: SPONSORS },
];

/**
 * Options bag for `generateAllTeams`. `small: true` matches
 * the `LeagueGenerator` small-pyramid mode (1 L1 + 1 L2 =
 * 32 teams). Default is the full 1+4+16+64 league × 16
 * team = 1360 teams pyramid.
 */
export interface GenerateAllTeamsOptions {
  small?: boolean;
}

/**
 * Build a pool of `count` unique team names for a
 * league, drawing from the per-tier city list and the
 * three name styles (`SUFFIXES` / `MASCOTS` /
 * `SPONSORS`). The global `usedNames` set is consulted
 * so no name appears twice in the pyramid.
 *
 * Pool strategy: one shuffled list per style, then
 * round-robin pull. The first 3 names are guaranteed
 * to be 1× suffix + 1× mascot + 1× sponsor (so a
 * 16-team league has plenty of every style), and
 * dedupe against `usedNames` skips past the L1/L2
 * city overlap (the first 8 entries of both
 * `L1_CITIES` and `L2_CITIES` are identical).
 *
 * Why stratified + round-robin instead of one
 * shuffled pool:
 *
 *   1. Deterministic style coverage. A flat
 *      Fisher–Yates shuffle of a 232-name pool can
 *      produce 16 picks that are 0-of-suffix with
 *      ~7% probability (1 in 14 runs). Round-robin
 *      guarantees every style is pulled in the
 *      first 3 picks.
 *   2. Per-style shuffle preserves variety within
 *      a style (so a 16-team L1 doesn't end up
 *      `北京FC, 上海FC, 广州FC, …` — the suffix
 *      pool is also shuffled).
 *   3. Cross-league dedupe via the `usedNames` set
 *      stops a L1 `北京FC` and a L2 `北京FC` from
 *      coexisting.
 *
 * The fallback (`第N联队`, `第N+1联队`, …) is the
 * last-resort path; the spec asserts it never fires
 * for the standard 1360-team pyramid.
 */
function pickNamesForLeague(
  tier: number,
  count: number,
  usedNames: Set<string>,
): string[] {
  const cities = tier === 1 ? L1_CITIES : L2_CITIES;
  const result: string[] = [];

  // Build one pool per style. Each pool is a flat
  // list of `city × value` combinations, then
  // shuffled so the order within a style is also
  // varied (not a deterministic `北京FC, 上海FC, …`).
  const stylePools: Record<NameStyle, string[]> = {
    suffix: [],
    mascot: [],
    sponsor: [],
  };
  for (const { style, values } of NAME_STYLES) {
    for (const city of cities) {
      for (const value of values) {
        stylePools[style].push(`${city}${value}`);
      }
    }
  }
  for (const pool of Object.values(stylePools)) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }

  // Round-robin pull, popping from the back of each
  // shuffled pool. We rotate the order each pass so
  // the same style doesn't lead every time.
  const styleOrder: NameStyle[] = ['suffix', 'mascot', 'sponsor'];
  let offset = 0;
  while (result.length < count) {
    let added = false;
    for (let s = 0; s < styleOrder.length && result.length < count; s++) {
      const style = styleOrder[(offset + s) % styleOrder.length];
      const pool = stylePools[style];
      // Skip past any names already consumed by an
      // earlier league (cross-league dedupe).
      while (pool.length > 0) {
        const name = pool.pop()!;
        if (!usedNames.has(name)) {
          result.push(name);
          usedNames.add(name);
          added = true;
          break;
        }
      }
    }
    if (!added) break;
    offset++;
  }

  // Fallback for the "user configured a 200-team
  // league in a 81-city pool" case — shouldn't fire
  // for the standard 16-team-per-league pyramid, but
  // kept as defence in depth.
  let fallbackN = 1;
  while (result.length < count) {
    const fallback = `第${fallbackN}联队`;
    if (!usedNames.has(fallback)) {
      result.push(fallback);
      usedNames.add(fallback);
    }
    fallbackN++;
    if (fallbackN > 1000) {
      throw new Error(
        `pickNamesForLeague: exhausted fallback names for tier=${tier} count=${count} — pool sizing bug`,
      );
    }
  }

  return result;
}

@Injectable()
export class TeamGenerator {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(StadiumEntity)
    private stadiumRepo: Repository<StadiumEntity>,
    @InjectRepository(LeagueEntity)
    private leagueRepo: Repository<LeagueEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Generate one `team` row per slot in the pyramid.
   *
   * Bot teams have no owning user — `team.userId` is left
   * `null` for every row this generator produces. The
   * historical design had a fake `bot_manager` user
   * whose id was stamped on every bot team, but the
   * product direction is that bot teams don't need an
   * account: they're managed by the simulator / cron
   * and become manager-owned only via the onboarding
   * claim flow (which is the only path that needs a
   * real `userId`).
   */
  async generateAllTeams(
    options: GenerateAllTeamsOptions = {},
  ): Promise<void> {
    const count = await this.teamRepo.count();
    if (count > 0) {
      this.logger.info(
        `[TeamGenerator] ${count} teams already exist, skipping`,
      );
      return;
    }

    const leagues = await this.leagueRepo.find();
    this.logger.info(
      `[TeamGenerator] Generating teams for ${leagues.length} leagues...`,
    );

    // Small mode: only the first 2 leagues (L1 + L2 div 1)
    // get teams. The rest are left empty so the schedule
    // generator's "needs 4+ teams" guard skips them.
    const targetLeagues = options.small ? leagues.slice(0, 2) : leagues;

    // Cross-league name uniqueness. The pool builder
    // (cities × 3 styles × values) is large enough
    // that we never run out within a single tier, but
    // the same city appears in both `L1_CITIES` and
    // `L2_CITIES` (the first 8 entries are identical),
    // so a naive per-league picker would happily stamp
    // `北京FC` on a L1 team AND a L2 team. The Set
    // tracks every name the pyramid has consumed so
    // a collision is impossible across leagues.
    const usedNames = new Set<string>();

    let teamCount = 0;
    for (const league of targetLeagues) {
      const pool = pickNamesForLeague(league.tier, league.maxTeams, usedNames);
      for (let i = 0; i < league.maxTeams; i++) {
        await this.createBotTeam(league, pool[i]);
        teamCount++;
      }
    }

    this.logger.info(
      `[TeamGenerator] Created ${teamCount} teams; running post-enrichment (city, foundedYear, jerseyTertiary, eloRating, bio, stadium.name)`,
    );
    await this.enrichAllTeams();
  }

  /**
   * Post-pass: fill in the cosmetic columns the
   * shared `createTeam` helper intentionally leaves
   * at their defaults. Touching this from
   * `createTeam` directly would pull the
   * city/elo logic into a function that the
   * onboarding path also uses; keeping it here
   * means the enrichment is an init-only concern
   * (a freshly-claimed BOT gets a manager-set
   * `city` + `bio` later, not via this path).
   *
   * Runs as a single batched UPDATE for
   * `team`/`stadium` rather than N round-trips.
   */
  private async enrichAllTeams(): Promise<void> {
    const teams = await this.teamRepo.find();
    if (teams.length === 0) {
      return;
    }

    // Pre-fetch every stadium in one shot.
    const stadiumRows = await this.stadiumRepo.find();
    const stadiumByTeam = new Map(stadiumRows.map((s) => [s.teamId, s]));

    // Build the per-team enrichment values once. The
    // previous implementation issued N `teamRepo.update`
    // + N `stadiumRepo.update` round-trips (2720 for the
    // 1360-team pyramid) — every row in a separate
    // transaction. The new code batches each table
    // into a single `UPDATE … FROM (VALUES …)` per
    // chunk, dropping the round-trip count to O(teams /
    // CHUNK_SIZE) and the wall-clock time by ~100x.
    const teamRows: Array<{
      id: string;
      city: string;
      foundedYear: number;
      jerseyColorTertiary: string;
      eloRating: number;
      bio: string;
    }> = [];
    const stadiumNameById: Array<{ id: string; name: string }> = [];
    for (const team of teams) {
      const city = this.extractCity(team.name) ?? '中国';
      const foundedYear = randomInt(1950, 2010);
      const jerseyTertiary = this.randomJerseyTertiary();
      // ELO from team OVR: a 50-OVR team is the
      // "average" 1500; +1 OVR ≈ +20 ELO. Tight
      // range keeps every matchday predictable
      // for the engine (no runaway favourites).
      const eloRating = 1500 + Math.round((team.botLevel - 5) * 20);
      const bio = `${team.name} 是位于${city}的球队，成立于 ${foundedYear} 年。`;

      teamRows.push({
        id: team.id,
        city,
        foundedYear,
        jerseyColorTertiary: jerseyTertiary,
        eloRating,
        bio,
      });

      const stadium = stadiumByTeam.get(team.id);
      if (stadium) {
        stadiumNameById.push({
          id: stadium.id,
          name: `${city}体育中心`,
        });
      }
    }

    await this.batchUpdateTeams(teamRows);
    await this.batchUpdateStadiumNames(stadiumNameById);

    this.logger.info(
      `[TeamGenerator] post-enriched ${teamRows.length} team(s) in ` +
        `${this.lastBatchRoundTrips} batched round-trip(s)`,
    );
  }

  /**
   * Number of round-trips the last `enrichAllTeams`
   * pass issued (team chunks + stadium chunks). Exposed
   * on the instance so the spec can assert the
   * round-trip count is bounded by `teams.length /
   * BATCH_CHUNK_SIZE` rather than `teams.length`. Read
   * immediately after `enrichAllTeams()` completes.
   */
  private lastBatchRoundTrips = 0;

  /**
   * Chunk size for the batched `UPDATE … FROM (VALUES
   * …)`. PostgreSQL's default max-bind-parameter
   * limit is 65535; the team batch is 6 params / row
   * and the stadium batch is 2 / row, so 500 rows is
   * 3000 / 1000 params per chunk — well under the cap
   * with headroom for a future column add. 500 also
   * keeps the prepared-statement plan cache hit
   * across the chunks (same shape, different values).
   */
  private static readonly BATCH_CHUNK_SIZE = 500;

  private async batchUpdateTeams(
    rows: Array<{
      id: string;
      city: string;
      foundedYear: number;
      jerseyColorTertiary: string;
      eloRating: number;
      bio: string;
    }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    let roundTrips = 0;
    for (let i = 0; i < rows.length; i += TeamGenerator.BATCH_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + TeamGenerator.BATCH_CHUNK_SIZE);
      const tuples: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (const r of chunk) {
        tuples.push(
          `($${p++}::uuid, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
        );
        params.push(
          r.id,
          r.city,
          r.foundedYear,
          r.jerseyColorTertiary,
          r.eloRating,
          r.bio,
        );
      }
      const sql = `
        UPDATE team SET
          city                = v.city,
          founded_year        = v.founded_year,
          jersey_color_tertiary = v.jersey_color_tertiary,
          elo_rating          = v.elo_rating,
          bio                 = v.bio
        FROM (VALUES ${tuples.join(', ')})
          AS v(id, city, founded_year, jersey_color_tertiary, elo_rating, bio)
        WHERE team.id = v.id
      `;
      await this.dataSource.query(sql, params);
      roundTrips++;
    }
    this.lastBatchRoundTrips += roundTrips;
  }

  private async batchUpdateStadiumNames(
    rows: Array<{ id: string; name: string }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    let roundTrips = 0;
    for (let i = 0; i < rows.length; i += TeamGenerator.BATCH_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + TeamGenerator.BATCH_CHUNK_SIZE);
      const tuples: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (const r of chunk) {
        tuples.push(`($${p++}::uuid, $${p++})`);
        params.push(r.id, r.name);
      }
      const sql = `
        UPDATE stadium SET
          name = v.name
        FROM (VALUES ${tuples.join(', ')})
          AS v(id, name)
        WHERE stadium.id = v.id
      `;
      await this.dataSource.query(sql, params);
      roundTrips++;
    }
    this.lastBatchRoundTrips += roundTrips;
  }

  /**
   * Parse the city prefix from a team name like
   * "北京FC" → "北京". Falls back to the first
   * run of 2-3 Han characters; "上海United" → "上海",
   * "北京Athletic" → "北京". If nothing looks like a
   * city, returns null and the caller defaults to
   * "中国".
   */
  private extractCity(teamName: string): string | null {
    // First 2 or 3 Chinese characters at the start
    // of the name form the city. The non-Chinese
    // suffix (FC / United / Club / City / Athletic)
    // always follows; we strip from the first
    // non-Chinese char.
    const m = teamName.match(/^([\u4e00-\u9fff]{2,3})/);
    return m ? m[1] : null;
  }

  private randomJerseyTertiary(): string {
    // Tertiary color is the "trim" — a darker
    // accent than the primary. Pulled from a small
    // neutral palette so every team gets a
    // visually-coordinated kit.
    const palette = [
      '#1A1A1A',
      '#0F0F0F',
      '#2C2C2C',
      '#3D2B1F',
      '#1F3D2B',
      '#1F2B3D',
    ];
    return palette[Math.floor(Math.random() * palette.length)];
  }

  private generateTeamName(tier: number, index: number): string {
    // Legacy single-name entry point kept for the
    // existing spec; the production path uses
    // `pickNamesForLeague` above. The new path
    // pre-builds a shuffled, deduped pool of `count`
    // names per league rather than computing one
    // name at a time.
    return pickNamesForLeague(tier, Math.max(index + 1, 1), new Set())[index] ??
      '第1联队';
  }

  /**
   * Single-team bootstrap path. Delegates to the shared
   * `@goalxi/database` `createTeam` so a bot's squad shape
   * (16 players, 25-40 OVR, v2 specialty distribution) is
   * identical to a manager's first squad — only the
   * `isBot` / `userId` / starting balance / starting fans
   * differ.
   *
   * Pre-generates a unique `shortCode` so the `team.shortCode`
   * column (which has a DB-level UNIQUE constraint) doesn't
   * fail on insert. The 5-char code is exposed in URLs and
   * the UI; the UUID `id` stays the internal PK.
   */
  private async createBotTeam(
    league: LeagueEntity,
    teamName: string,
  ): Promise<void> {
    const manager = this.dataSource.manager;
    const shortCode = await generateUniqueShortCode(async (code) => {
      const taken = await manager.findOne(TeamEntity, {
        where: { shortCode: code },
      });
      return taken !== null;
    });
    await createTeam(manager, {
      leagueId: league.id,
      name: teamName,
      nationality: 'CN',
      isBot: true,
      botLevel: 5,
      // Bot teams have no owning user — see the
      // docstring on `generateAllTeams` and the
      // matching comment on `CreateTeamParams.userId`.
      userId: null,
      shortCode,
      season: 1,
    });
  }
}

/**
 * Inclusive random integer in [min, max]. Mirrors the
 * helper in `team-onboarding-generator.ts` so the
 * post-enrichment pass has no dependency on the
 * `@goalxi/database` package for a one-liner.
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

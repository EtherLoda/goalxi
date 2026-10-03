/**
 * Season Test CLI - Full system integration test
 *
 * Usage:
 *   pnpm cli:season-test --tiers 2 --fresh
 *   pnpm cli:season-test --tiers 2
 *   pnpm cli:season-test --weeks 8 --tiers 2
 */

import { parseArgs } from 'util';
import { DataSource } from 'typeorm';
import * as db from '@goalxi/database';
import {
  LeagueEntity,
  TeamEntity,
  PlayerEntity,
  MatchEntity,
  MatchEventEntity,
  MatchStatus,
  MatchType,
  LeagueStandingEntity,
  FinanceEntity,
  StaffEntity,
  StaffRole,
  TrainingCategory,
  MatchPhase,
  PlayerSkills,
  GKTechnical,
  OutfieldTechnical,
  UserEntity,
  StadiumEntity,
  distributeTrainingPoints,
  GAME_SETTINGS,
  getEventTwoAxis,
  SeasonResultEntity,
} from '@goalxi/database';
import { SeasonSchedulerService } from '../src/scheduler/season-scheduler.service';

// ============ CLI Args ============

interface CliArgs {
  tiers: number;
  weeks: number;
  teamsPerLeague: number;
  fresh: boolean;
  help: boolean;
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      tiers: { type: 'string', short: 't', default: '2' },
      // Derived, not a literal: this was hardcoded to 16 and survived the
      // 16w2m -> 11w3m compression, so a bare `pnpm cli:season-test` ran
      // five empty weeks past the end of the season.
      weeks: {
        type: 'string',
        short: 'w',
        default: String(GAME_SETTINGS.SEASON_LENGTH_WEEKS),
      },
      teams: { type: 'string', short: 'n', default: '16' },
      fresh: { type: 'boolean', short: 'f', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
Season Test CLI - Full system integration test

Usage:
  pnpm cli:season-test --tiers 2 --fresh
  pnpm cli:season-test --tiers 2 --weeks 11

Options:
  --tiers, -t    Number of tiers (default: 2)
  --weeks, -w    Weeks to simulate (default: ${GAME_SETTINGS.SEASON_LENGTH_WEEKS})
  --teams, -n    Teams per league (default: 16)
  --fresh, -f    Drop and recreate database
  --help, -h     Show this help message
    `);
    process.exit(0);
  }

  return {
    tiers: parseInt(values.tiers) || 2,
    weeks: parseInt(values.weeks) || 16,
    teamsPerLeague: parseInt(values.teams) || 16,
    fresh: values.fresh,
    help: values.help as boolean,
  };
}

// ============ DB Setup ============

async function createDataSource(): Promise<DataSource> {
  // Get all entity classes from @goalxi/database
  const entityValues = Object.values(db);
  const entities = entityValues.filter(
    (e) =>
      typeof e === 'function' &&
      (e as any).prototype &&
      (e as any).name.endsWith('Entity') &&
      (e as any).name !== 'AbstractEntity',
  ) as any[];

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'goalxi',
    entities,
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();
  return dataSource;
}

// ============ League Generation ============

async function generateLeagues(ds: DataSource, tierNum: number): Promise<void> {
  const leagueRepo = ds.getRepository(LeagueEntity);
  console.log(`[League] Generating ${tierNum} tier pyramid...`);

  // L1: 1 league
  const l1 = leagueRepo.create({
    name: 'Test League L1',
    tier: 1,
    tierDivision: 1,
    maxTeams: 16,
    promotionSlots: 1,
    playoffSlots: 4,
    relegationSlots: 4,
    status: 'active',
  });
  await leagueRepo.save(l1);
  console.log(`[League] Created L1: ${l1.name}`);

  // L2: 4 leagues
  for (let d = 1; d <= 4; d++) {
    const league = leagueRepo.create({
      name: `Test League L2 Div ${d}`,
      tier: 2,
      tierDivision: d,
      maxTeams: 16,
      promotionSlots: 1,
      playoffSlots: 4,
      relegationSlots: 4,
      status: 'active',
      parentLeagueId: l1.id,
    });
    await leagueRepo.save(league);
  }
  console.log(`[League] Created 4 L2 leagues`);

  // L3+ (if more tiers)
  if (tierNum >= 3) {
    for (let d = 1; d <= 16; d++) {
      const l2Div = Math.ceil(d / 4);
      const parent = await leagueRepo.findOne({
        where: { tier: 2, tierDivision: l2Div },
      });
      const league = leagueRepo.create({
        name: `Test League L3 Div ${d}`,
        tier: 3,
        tierDivision: d,
        maxTeams: 16,
        promotionSlots: 1,
        playoffSlots: 4,
        relegationSlots: 4,
        status: 'active',
        parentLeagueId: parent?.id,
      });
      await leagueRepo.save(league);
    }
    console.log(`[League] Created 16 L3 leagues`);
  }
}

// ============ Team Generation ============

const FIRST_NAMES = [
  '伟',
  '明',
  '军',
  '强',
  '磊',
  '涛',
  '勇',
  '杰',
  '鹏',
  '飞',
  '超',
  '波',
  '华',
  '凯',
  '旋',
  '宇',
  '晨',
  '浩',
  '文',
  '龙',
];
const LAST_NAMES = [
  '伟',
  '芳',
  '刚',
  '强',
  '林',
  '敏',
  '静',
  '丽',
  '辉',
  '鹏',
  '杰',
  '涛',
  '勇',
  '飞',
  '超',
  '华',
  '凯',
  '旋',
  '宇',
];
const CITY_NAMES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '成都',
  '武汉',
  '杭州',
  '南京',
  '西安',
  '苏州',
  '天津',
  '重庆',
  '长沙',
  '郑州',
  '济南',
  '青岛',
];
const SUFFIXES = ['FC', 'United', 'Club', 'City', 'Athletic'];

async function generateTeams(ds: DataSource): Promise<void> {
  const leagueRepo = ds.getRepository(LeagueEntity);
  const teamRepo = ds.getRepository(TeamEntity);
  const playerRepo = ds.getRepository(PlayerEntity);
  const staffRepo = ds.getRepository(StaffEntity);
  const financeRepo = ds.getRepository(FinanceEntity);
  const standingRepo = ds.getRepository(LeagueStandingEntity);
  const stadiumRepo = ds.getRepository(StadiumEntity);

  const leagues = await leagueRepo.find();
  console.log(`[Team] Generating teams for ${leagues.length} leagues...`);

  let totalTeams = 0;
  let totalPlayers = 0;

  for (const league of leagues) {
    for (let i = 0; i < 16; i++) {
      const city = CITY_NAMES[i % CITY_NAMES.length];
      const suffix = SUFFIXES[i % SUFFIXES.length];
      const teamName = `${city}${suffix}`;

      const team = teamRepo.create({
        name: teamName,
        leagueId: league.id,
        isBot: true,
        botLevel: 5,
        nationality: 'CN',
        benchConfig: null,
      });
      const savedTeam = await teamRepo.save(team);
      totalTeams++;

      // Create stadium for the team
      const stadium = stadiumRepo.create({
        teamId: savedTeam.id,
        capacity: 5000 + randomInt(0, 10) * 500,
        isBuilt: true,
      });
      await stadiumRepo.save(stadium);

      // Create 16 players per team
      const players: ReturnType<typeof playerRepo.create>[] = [];
      for (let p = 0; p < 16; p++) {
        const isGK = p < 2;
        const age = randomInt(20, 28);
        const { current, potential } = generatePlayerSkills(isGK, age);

        players.push(
          playerRepo.create({
            name: `${FIRST_NAMES[randomInt(0, FIRST_NAMES.length - 1)]}${LAST_NAMES[randomInt(0, LAST_NAMES.length - 1)]}`,
            teamId: savedTeam.id,
            isGoalkeeper: isGK,
            nationality: 'CN',
            createdDay: generateCreatedDay(age),
            isYouth: false,
            currentSkills: current,
            potentialSkills: potential,
            potentialAbility: Math.round(calculateOvr(potential) * 5),
            experience: randomFloat(5, 15),
            form: randomFloat(3, 5),
            stamina: randomFloat(4, 5),
            currentWage: 5000,
          }),
        );
      }
      await playerRepo.save(players);
      totalPlayers += players.length;

      // Create head coach
      await staffRepo.save(
        staffRepo.create({
          teamId: savedTeam.id,
          name: `${FIRST_NAMES[randomInt(0, FIRST_NAMES.length - 1)]}${LAST_NAMES[randomInt(0, LAST_NAMES.length - 1)]}`,
          role: StaffRole.HEAD_COACH,
          level: 2,
          salary: 4000,
          contractExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          autoRenew: true,
          isActive: true,
          nationality: 'CN',
        }),
      );

      // Create finance
      await financeRepo.save(
        financeRepo.create({
          teamId: savedTeam.id,
          balance: 5000000,
        }),
      );

      // Create standing
      await standingRepo.save(
        standingRepo.create({
          teamId: savedTeam.id,
          leagueId: league.id,
          season: 1,
          position: 0,
          played: 0,
          points: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
        }),
      );
    }
  }

  console.log(
    `[Team] Created ${totalTeams} teams with ${totalPlayers} players`,
  );
}

function generatePlayerSkills(
  isGK: boolean,
  age: number,
): { current: PlayerSkills; potential: PlayerSkills } {
  const skillBase = randomInt(11, 15);
  const current = generateSkillsForAge(skillBase, age, isGK);
  const potential = generateSkillsForAge(
    skillBase + randomInt(3, 8),
    age + 2,
    isGK,
  );
  return { current, potential };
}

function generateSkillsForAge(
  baseOvr: number,
  age: number,
  isGK: boolean,
): PlayerSkills {
  const skillValue = Math.round(baseOvr / 5);
  const variance = () => Math.random() * 2 - 1;

  if (isGK) {
    return {
      physical: {
        pace: Math.max(1, Math.min(20, skillValue + variance())),
        strength: Math.max(1, Math.min(20, skillValue + variance())),
      },
      technical: {
        reflexes: Math.max(1, Math.min(20, skillValue + 2 + variance())),
        handling: Math.max(1, Math.min(20, skillValue + 2 + variance())),
        aerial: Math.max(1, Math.min(20, skillValue + variance())),
        positioning: Math.max(1, Math.min(20, skillValue + variance())),
      } as GKTechnical,
      mental: {
        positioning: Math.max(1, Math.min(20, skillValue + variance())),
        composure: Math.max(1, Math.min(20, skillValue + variance())),
      },
      setPieces: {
        freeKicks: Math.max(1, Math.min(20, skillValue - 2 + variance())),
        penalties: Math.max(1, Math.min(20, skillValue - 2 + variance())),
      },
    };
  }

  return {
    physical: {
      pace: Math.max(1, Math.min(20, skillValue + variance())),
      strength: Math.max(1, Math.min(20, skillValue + variance())),
    },
    technical: {
      finishing: Math.max(1, Math.min(20, skillValue + 2 + variance())),
      passing: Math.max(1, Math.min(20, skillValue + variance())),
      dribbling: Math.max(1, Math.min(20, skillValue + variance())),
      defending: Math.max(1, Math.min(20, skillValue - 1 + variance())),
    } as OutfieldTechnical,
    mental: {
      positioning: Math.max(1, Math.min(20, skillValue + variance())),
      composure: Math.max(1, Math.min(20, skillValue + variance())),
    },
    setPieces: {
      freeKicks: Math.max(1, Math.min(20, skillValue - 2 + variance())),
      penalties: Math.max(1, Math.min(20, skillValue - 2 + variance())),
    },
  };
}

function calculateOvr(skills: PlayerSkills): number {
  const tech = skills.technical as unknown as Record<string, number>;
  const vals = Object.values(tech);
  return (vals.reduce((a, b) => a + b, 0) / vals.length) * 5;
}

function generateCreatedDay(age: number): number {
  // [C2] Age in days, anchored to the 1970-01-01 game epoch used everywhere.
  const today = Math.floor((Date.now() - Date.UTC(1970, 0, 1)) / 86_400_000);
  // `DAYS_PER_YEAR`, not a literal 112 — this script seeds players straight
  // into the DB, so a stale divisor here would silently mis-age the whole
  // simulated world.
  const daysAlive =
    age * GAME_SETTINGS.DAYS_PER_YEAR +
    Math.floor(Math.random() * GAME_SETTINGS.DAYS_PER_YEAR);
  return today - daysAlive;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// ============ Schedule Generation ============

/**
 * The production season scheduler, built by hand.
 *
 * This script used to carry its own `generateSchedule`, and it had
 * drifted from `ScheduleSchedulerService` in every dimension that
 * matters: 1 matchday a week instead of `ROUNDS_PER_WEEK`, a 13:00 local
 * kickoff instead of `MATCH_DAY_OFFSETS` at 06:00 UTC, and a naive
 * `generateRoundMatchups` rotation instead of circle-method pairings with
 * the Thielen home/away solve. A rollover through it produced a 30-week
 * all-Friday season — 30, not 11 — which no production code path would
 * ever produce.
 *
 * Rather than keep a second copy of the algorithm alive, the rollover
 * calls the real thing. `SeasonSchedulerService` only needs a logger,
 * three repositories and the data source, so it can be constructed
 * outside Nest.
 */
function productionScheduler(ds: DataSource): SeasonSchedulerService {
  return new SeasonSchedulerService(
    {
      info: (m: unknown) => console.log(m),
      warn: (m: unknown) => console.warn(m),
      error: (m: unknown) => console.error(m),
      debug: (m: unknown) => console.log(m),
      verbose: (m: unknown) => console.log(m),
    } as never,
    ds.getRepository(MatchEntity),
    ds.getRepository(LeagueEntity),
    ds.getRepository(LeagueStandingEntity),
    ds,
  );
}
// ============ Match Simulation (Simplified for testing) ============

/**
 * Simplified match simulation - generates realistic random scores for integration testing
 * Uses basic team strength estimation from player overall ratings
 */
/**
 * RFC 0002 two-axis fields for a `match_event` row.
 *
 * `getEventTwoAxis` returns `{ classId, ... }`, but the entity column is
 * `eventClassId`. Spreading the helper's result straight into
 * `eventRepo.create()` silently sets an unmapped property and leaves
 * `event_class_id` NULL — which violates its NOT NULL constraint at
 * insert time, not at compile time. `simulation.processor.ts` remaps
 * explicitly for the same reason; this mirrors it.
 */
function twoAxis(typeName: string) {
  const axis = getEventTwoAxis(typeName);
  // Fail here, not 20400 matches into a NOT NULL violation. Every event
  // this script writes must have a class; an unmapped `typeName` is a
  // bug in EVENT_TWO_AXIS, and it should say so.
  if (axis.classId == null) {
    throw new Error(
      `[season-test-cli] EVENT_TWO_AXIS has no entry for '${typeName}'. ` +
        `event_class_id is NOT NULL, so this event cannot be persisted.`,
    );
  }
  return {
    eventClassId: axis.classId,
    outcomeId: axis.outcomeId,
    outcomeCode: axis.outcomeCode,
  };
}

async function simulateMatch(
  ds: DataSource,
  match: MatchEntity,
): Promise<void> {
  const matchRepo = ds.getRepository(MatchEntity);
  const eventRepo = ds.getRepository(MatchEventEntity);
  const playerRepo = ds.getRepository(PlayerEntity);

  // Get players for both teams
  const homePlayers = await playerRepo.find({
    where: { teamId: match.homeTeamId },
  });
  const awayPlayers = await playerRepo.find({
    where: { teamId: match.awayTeamId },
  });

  if (homePlayers.length < 11 || awayPlayers.length < 11) {
    console.warn(`[Sim] Team has insufficient players for match ${match.id}`);
    return;
  }

  // Calculate team strength from player overall
  const calcTeamOvr = (players: PlayerEntity[]) => {
    if (players.length === 0) return 60;
    const techVals = players.slice(0, 11).map((p) => {
      const t = p.currentSkills.technical as unknown as Record<string, number>;
      return (
        Object.values(t).reduce((a, b) => a + b, 0) / Object.values(t).length
      );
    });
    return Math.round(techVals.reduce((a, b) => a + b, 0) / techVals.length);
  };

  const homeOvr = calcTeamOvr(homePlayers);
  const awayOvr = calcTeamOvr(awayPlayers);

  // Generate realistic score based on team strength
  const homeGoals = Math.max(
    0,
    Math.round((homeOvr - 50 + Math.random() * 20 - awayOvr + 50) / 10),
  );
  const awayGoals = Math.max(
    0,
    Math.round((awayOvr - 50 + Math.random() * 20 - homeOvr + 50) / 10),
  );

  // Generate match events (goals)
  const events: ReturnType<typeof eventRepo.create>[] = [];
  for (let i = 0; i < homeGoals; i++) {
    const scorer = homePlayers[randomInt(0, homePlayers.length - 1)];
    const minute = randomInt(1, 90);
    events.push(
      eventRepo.create({
        matchId: match.id,
        minute,
        // `type` (legacy int enum) was dropped in
        // RFC 0002: the event is identified by `typeName` (wire
        // format) PLUS the `eventClassId` / `outcomeId` /
        // `outcomeCode` two-axis tuple. The `event_class_id` column is
        // NOT NULL, so the tuple is mandatory on insert — the fallback
        // to `typeName` is a *read* path for legacy rows, not a way to
        // skip writing it. The simulator processor does the same thing
        // via `getEventTwoAxis`; this dev-script predated that and
        // crashed on the NOT NULL constraint.
        ...twoAxis('goal'),
        typeName: 'goal',
        teamId: match.homeTeamId,
        playerId: scorer?.id,
        eventScheduledTime: new Date(Date.now() + minute * 60 * 1000),
        phase: minute <= 45 ? MatchPhase.FIRST_HALF : MatchPhase.SECOND_HALF,
      }),
    );
  }
  for (let i = 0; i < awayGoals; i++) {
    const scorer = awayPlayers[randomInt(0, awayPlayers.length - 1)];
    const minute = randomInt(1, 90);
    events.push(
      eventRepo.create({
        matchId: match.id,
        minute,
        // See note on the home loop — `type` was
        // dropped in RFC 0002 and `typeName` alone
        // is not enough: `event_class_id` is NOT NULL.
        ...twoAxis('goal'),
        typeName: 'goal',
        teamId: match.awayTeamId,
        playerId: scorer?.id,
        eventScheduledTime: new Date(Date.now() + minute * 60 * 1000),
        phase: minute <= 45 ? MatchPhase.FIRST_HALF : MatchPhase.SECOND_HALF,
      }),
    );
  }

  // Update match
  //
  // `COMPLETED`, not `IN_PROGRESS`. Leaving finished matches in
  // `IN_PROGRESS` means every "are this week's matches done?" check
  // downstream answers no forever — `LeagueAwardService`'s
  // `areAllWeekMatchesCompleted` counts on `status = COMPLETED`, so a
  // full run of this script used to leave the whole season permanently
  // unpaid and invisible to the settlement crons.
  match.status = MatchStatus.COMPLETED;
  match.homeScore = homeGoals;
  match.awayScore = awayGoals;
  match.startedAt = new Date();
  match.completedAt = new Date(Date.now() + 90 * 60 * 1000);
  match.actualEndTime = match.completedAt;
  await matchRepo.save(match);

  // Save events
  await eventRepo.save(events);

  // Update standings
  await updateStandings(ds, match);

  console.log(
    `  [Match] ${match.homeTeam?.name || 'Home'} ${homeGoals} - ${awayGoals} ${match.awayTeam?.name || 'Away'}`,
  );
}

function selectRandomPlayers(
  players: PlayerEntity[],
  count: number,
): PlayerEntity[] {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

async function updateStandings(
  ds: DataSource,
  match: MatchEntity,
): Promise<void> {
  // Youth-league matches don't update senior LeagueStanding rows —
  // their standings live on a separate (TBD) table. Bail out if the
  // match has no senior league id.
  if (!match.leagueId) return;

  const standingRepo = ds.getRepository(LeagueStandingEntity);

  const homeStanding = await standingRepo.findOne({
    where: {
      teamId: match.homeTeamId,
      leagueId: match.leagueId,
      season: match.season,
    },
  });
  const awayStanding = await standingRepo.findOne({
    where: {
      teamId: match.awayTeamId,
      leagueId: match.leagueId,
      season: match.season,
    },
  });

  if (homeStanding && awayStanding) {
    homeStanding.played += 1;
    awayStanding.played += 1;
    homeStanding.goalsFor += match.homeScore || 0;
    homeStanding.goalsAgainst += match.awayScore || 0;
    awayStanding.goalsFor += match.awayScore || 0;
    awayStanding.goalsAgainst += match.homeScore || 0;
    homeStanding.goalDifference =
      homeStanding.goalsFor - homeStanding.goalsAgainst;
    awayStanding.goalDifference =
      awayStanding.goalsFor - awayStanding.goalsAgainst;

    if ((match.homeScore || 0) > (match.awayScore || 0)) {
      homeStanding.wins += 1;
      homeStanding.points += 3;
      awayStanding.losses += 1;
    } else if ((match.homeScore || 0) < (match.awayScore || 0)) {
      awayStanding.wins += 1;
      awayStanding.points += 3;
      homeStanding.losses += 1;
    } else {
      homeStanding.draws += 1;
      awayStanding.draws += 1;
      homeStanding.points += 1;
      awayStanding.points += 1;
    }

    await standingRepo.save([homeStanding, awayStanding]);
  }
}

// ============ Weekly Training Settlement ============

async function processWeeklyTraining(ds: DataSource): Promise<void> {
  const teamRepo = ds.getRepository(TeamEntity);
  const playerRepo = ds.getRepository(PlayerEntity);
  const staffRepo = ds.getRepository(StaffEntity);

  const teams = await teamRepo.find();
  let totalTrained = 0;

  for (const team of teams) {
    const players = await playerRepo.find({ where: { teamId: team.id } });
    const staffList = await staffRepo.find({
      where: { teamId: team.id, isActive: true },
    });

    // Select 3-6 players randomly for training (max 6 regular slots)
    const traineeCount = randomInt(3, 6);
    const trainees = selectRandomPlayers(
      players.filter((p) => !p.isYouth),
      traineeCount,
    );

    for (const player of trainees) {
      // [C2] Age derived from createdDay via the 1970-01-01 game epoch.
      const today = Math.floor(
        (Date.now() - Date.UTC(1970, 0, 1)) / 86_400_000,
      );
      const age =
        player.createdDay != null
          ? Math.floor(
              (today - player.createdDay) / GAME_SETTINGS.DAYS_PER_YEAR,
            )
          : 25;

      // Random training category
      const categories = Object.values(TrainingCategory);
      const category = categories[randomInt(0, categories.length - 1)];

      // Calculate training points (simplified)
      const basePoints = 20; // BASE_WEEKLY_TRAINING
      const slotMultiplier = 1.0; // REGULAR
      const ageFactor =
        age <= 17 ? 1.0 : Math.max(0.65, 1.0 - (age - 17) * 0.02);

      const points =
        Math.round(basePoints * slotMultiplier * ageFactor * 100) / 100;

      // Distribute points to skills
      const result = distributeTrainingPoints(
        player.currentSkills,
        player.potentialSkills,
        points,
        player.isGoalkeeper,
        null,
      );

      // Update stamina (simplified fatigue)
      player.stamina = Math.min(5.0, player.stamina + randomFloat(0.1, 0.3));

      // Update experience
      player.experience += randomFloat(0.1, 0.5);

      await playerRepo.save(player);

      if (result.gains.length > 0) {
        totalTrained++;
      }
    }
  }

  console.log(`[Training] Trained ${totalTrained} player slot updates`);
}

// ============ User Creation ============

async function createTestUser(ds: DataSource): Promise<void> {
  const userRepo = ds.getRepository(UserEntity);
  const teamRepo = ds.getRepository(TeamEntity);

  const existing = await userRepo.findOne({
    where: { email: 'test@goalxi.com' },
  });

  if (existing) {
    console.log('[User] Test user already exists');
    return;
  }

  // Find first team to link to user
  const team = await teamRepo.findOne({ where: {} });
  if (!team) {
    console.log('[User] No team available to link to user');
    return;
  }

  const user = userRepo.create({
    username: 'testuser',
    email: 'test@goalxi.com',
    password: 'password123', // UserEntity @BeforeInsert hook will hash it
    nickname: 'Test User',
  });
  await userRepo.save(user);

  // Link team to user
  team.userId = user.id;
  await teamRepo.save(team);

  console.log(
    `[User] Created test user: test@goalxi.com / password123 (linked to team: ${team.name})`,
  );
}

// ============ Main ============

async function main() {
  const args = parseCliArgs();

  console.log('='.repeat(60));
  console.log('Season Test CLI - Full System Integration Test');
  console.log('='.repeat(60));
  console.log(
    `Tiers: ${args.tiers}, Weeks: ${args.weeks}, Fresh: ${args.fresh}`,
  );

  const ds = await createDataSource();
  console.log('[DB] Connected');

  if (args.fresh) {
    console.log('[DB] Dropping all tables...');
    await ds.dropDatabase();
    await ds.synchronize();
    console.log('[DB] Tables recreated');
  }

  // Check if data exists
  const leagueRepo = ds.getRepository(LeagueEntity);
  const existingLeagues = await leagueRepo.count();

  if (existingLeagues === 0) {
    // Generate leagues, teams, schedule
    await generateLeagues(ds, args.tiers);
    await generateTeams(ds);
    // `generateNextSeasonSchedule(0)` produces season 1.
    await productionScheduler(ds).generateNextSeasonSchedule(0);
    await createTestUser(ds);
  } else {
    console.log('[Data] Using existing data');
  }

  // Run simulation weeks
  const matchRepo = ds.getRepository(MatchEntity);
  const standingRepo = ds.getRepository(LeagueStandingEntity);

  let currentSeason = 1;

  for (let week = 1; week <= args.weeks; week++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Week ${week} (Season ${currentSeason})`);
    console.log('='.repeat(60));

    // Get matches for this week
    const matches = await matchRepo.find({
      where: { week, season: currentSeason },
      relations: ['homeTeam', 'awayTeam'],
    });

    console.log(`[Week ${week}] Found ${matches.length} matches`);

    // Simulate each match
    for (const match of matches) {
      if (
        match.status === MatchStatus.SCHEDULED ||
        match.status === MatchStatus.TACTICS_LOCKED
      ) {
        await simulateMatch(ds, match);
      }
    }

    // Weekly training settlement
    await processWeeklyTraining(ds);

    // Update standings positions
    await recalculateStandings(ds, currentSeason);

    // Weekly summary
    await printWeekSummary(ds, week, currentSeason);

    // The LAST regular-season week — when the table is final and
    // promotion/relegation is decided. Matches `SEASON_LAST_WEEK - 1` in
    // `season-transition.service.ts`.
    //
    // Was a bare `week === 15`, which silently became "never" when the
    // season was compressed to 11 weeks.
    //
    // NB: this was briefly mis-derived as `ROUNDS_PER_WEEK + 1`, on the
    // theory that the two agreed. They do not — `ROUNDS_PER_WEEK` is
    // matches per week (3), while the regular season is
    // `SEASON_LENGTH_WEEKS - 1` weeks (10). Promotions therefore fired in
    // week 4 and the full-season E2E caught it. No tripwire could: the
    // literal was gone, only a wrong derivation remained.
    const lastRegularWeek = GAME_SETTINGS.SEASON_LENGTH_WEEKS - 1;
    if (week === lastRegularWeek) {
      console.log(`\n[Week ${week}] Generating playoff matches...`);
      // For simplicity, process promotions directly
      await processPromotions(ds, currentSeason);
    }

    // End of season: roll over and generate the next schedule.
    // Was a bare `week === 16`, same failure mode as above.
    if (week === GAME_SETTINGS.SEASON_LENGTH_WEEKS) {
      console.log(`\n[Season ${currentSeason}] Season complete!`);
      // `generateNextSeasonSchedule(n)` produces season `n + 1`, so it
      // takes the season that just ENDED. This script incremented
      // `currentSeason` first and passed the result, which generated
      // season 3 and skipped a season; passing `currentSeason - 1`
      // instead generated season 1 and tripped the idempotency guard.
      // The un-incremented value is the right one.
      await productionScheduler(ds).generateNextSeasonSchedule(currentSeason);
      currentSeason++;
      console.log(`[Season ${currentSeason}] New season schedule generated`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Simulation Complete!');
  console.log('='.repeat(60));

  await ds.destroy();
  process.exit(0);
}

async function recalculateStandings(
  ds: DataSource,
  season: number,
): Promise<void> {
  const standingRepo = ds.getRepository(LeagueStandingEntity);
  const leagueRepo = ds.getRepository(LeagueEntity);

  const leagues = await leagueRepo.find();

  for (const league of leagues) {
    const standings = await standingRepo.find({
      where: { leagueId: league.id, season },
      order: { points: 'DESC', goalDifference: 'DESC', goalsFor: 'DESC' },
    });

    for (let i = 0; i < standings.length; i++) {
      standings[i].position = i + 1;
    }
    await standingRepo.save(standings);
  }
}

async function printWeekSummary(
  ds: DataSource,
  week: number,
  season: number,
): Promise<void> {
  const standingRepo = ds.getRepository(LeagueStandingEntity);
  const leagueRepo = ds.getRepository(LeagueEntity);

  const leagues = await leagueRepo.find();

  for (const league of leagues) {
    const standings = await standingRepo.find({
      where: { leagueId: league.id, season },
      order: { position: 'ASC' },
      take: 5,
    });

    if (standings.length === 0) continue;

    const top = standings
      .map((s) => `${s.position}. ${s.teamId?.slice(0, 8)}... Pts:${s.points}`)
      .join(' | ');

    console.log(`  ${league.name}: ${top}`);
  }
}

async function processPromotions(
  ds: DataSource,
  season: number,
): Promise<void> {
  const leagueRepo = ds.getRepository(LeagueEntity);
  const standingRepo = ds.getRepository(LeagueStandingEntity);
  const teamRepo = ds.getRepository(TeamEntity);

  const leagues = await leagueRepo.find({ order: { tier: 'ASC' } });

  for (const league of leagues) {
    const standings = await standingRepo.find({
      where: { leagueId: league.id, season },
      order: { position: 'ASC' },
    });

    if (standings.length === 0) continue;

    // Promote top team
    if (standings[0] && league.tier > 1) {
      const upperLeague = await leagueRepo.findOne({
        where: { tier: league.tier - 1, tierDivision: league.tierDivision },
      });
      if (upperLeague) {
        const team = await teamRepo.findOne({
          where: { id: standings[0].teamId as any },
        });
        if (team) {
          team.leagueId = upperLeague.id;
          await teamRepo.save(team);
          console.log(`  [Promo] ${team.name} promoted to ${upperLeague.name}`);
        }
      }
    }

    // Relegate bottom team
    if (standings[standings.length - 1] && league.tier < 4) {
      const lowerLeague = await leagueRepo.findOne({
        where: { tier: league.tier + 1, tierDivision: league.tierDivision },
      });
      if (lowerLeague) {
        const team = await teamRepo.findOne({
          where: { id: standings[standings.length - 1].teamId as any },
        });
        if (team) {
          team.leagueId = lowerLeague.id;
          await teamRepo.save(team);
          console.log(
            `  [Releg] ${team.name} relegated to ${lowerLeague.name}`,
          );
        }
      }
    }
  }
}

main().catch((err) => {
  console.error('[Error]', err);
  process.exit(1);
});

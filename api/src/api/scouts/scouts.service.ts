import {
  DEFAULT_TIER_DISTRIBUTION,
  PlayerEntity,
  SCOUT_ABILITY_CHANCE,
  SCOUT_ABILITY_POOL,
  SCOUT_GOALKEEPER_CHANCE,
  SCOUT_IMPACT_COEFFICIENTS,
  SCOUT_OUTFIELD_POSITIONS,
  SCOUT_POSITION_SKILL_IMPACT,
  SCOUT_REVEALED_SKILL_COUNT,
  ScoutCandidateEntity,
  ScoutCandidatePlayerData,
  TeamEntity,
  Uuid,
  YouthTeamEntity,
  currentGameDay,
  currentWeekIndex,
  endOfCurrentWeek,
  generateScoutCandidate,
  getYouthSkillKeys,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { getRandomNameByNationality } from '../../constants/name-database';
import { calculatePotentialAbility } from '../../utils/player-generator';

/** Default nationality when the team has none set — fall back to CN. */
const DEFAULT_TEAM_NATIONALITY = 'CN';

/**
 * Senior scouting mode — produce 17–18 year-old players who slot
 * straight into the senior squad. Distinct from the youth academy
 * flow (15–16, walks into `isYouth=true`) which lives in
 * `SCOUT_AGE_RANGE` and is reserved for the upcoming Youth Mode.
 */
const SENIOR_AGE_RANGE: [number, number] = [17, 18];

/** Hard skill ranges the senior scouting flow commits to. */
const SENIOR_CURRENT_MIN = 2;
const SENIOR_CURRENT_MAX = 9;
const SENIOR_POTENTIAL_MIN = 8;
const SENIOR_POTENTIAL_MAX = 20;

/** Walk a flat skill map (every value is a number) and run `fn` on
 *  each entry. Used by `applySeniorSkillCaps` to clamp the
 *  post-`flattenSkills` shape without having to rebuild the nested
 *  PlayerSkills object. */
function forEachSkillValue(
  skills: Record<string, number>,
  fn: (v: number) => number,
): void {
  for (const k of Object.keys(skills)) {
    const v = skills[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      skills[k] = fn(v);
    }
  }
}

/**
 * Clamp the generated candidate to the senior-mode ranges and
 * guarantee the invariant `current ≤ potential` (cheap swap when the
 * generator rolls a tight pair). Without the swap, the bar on the
 * card would lie (showing current > potential).
 */
function applySeniorSkillCaps(
  current: Record<string, number>,
  potential: Record<string, number>,
): void {
  forEachSkillValue(current, (v) =>
    Math.max(SENIOR_CURRENT_MIN, Math.min(SENIOR_CURRENT_MAX, v)),
  );
  forEachSkillValue(potential, (v) =>
    Math.max(SENIOR_POTENTIAL_MIN, Math.min(SENIOR_POTENTIAL_MAX, v)),
  );
  // Enforce current ≤ potential — if the dice rolled an awkward
  // pairing, swap the two values. Single-pass; once-per-key is
  // enough because we only need a valid value pair, not a realistic
  // re-roll.
  for (const k of Object.keys(potential)) {
    const cur = current[k];
    const pot = potential[k];
    if (typeof cur === 'number' && typeof pot === 'number' && cur > pot) {
      current[k] = pot;
      potential[k] = cur;
    }
  }
}

/**
 * Generate scout candidate player data via the shared `@goalxi/database`
 * utility. The team argument is used to pin the candidate's nationality
 * to the team's own (a senior-mode scout always brings back someone
 * from the same country as the parent club) — when the team has no
 * nationality, we fall back to CN.
 *
 * Senior mode: ages 17–18, current skills in [2, 9], potential in
 * [8, 20], with the invariant `current ≤ potential` enforced after
 * the generator returns.
 */
function generatePlayerData(team: TeamEntity) {
  const nationality = team.nationality ?? DEFAULT_TEAM_NATIONALITY;
  // The shared generator uses a gaussian centered at 13 / stddev 2.5
  // for the potential-skill range, which keeps ~99% of draws inside
  // [8, 20] after the hard caps we apply below.
  const raw = generateScoutCandidate({
    tierDistribution: DEFAULT_TIER_DISTRIBUTION,
    algorithm: 'gaussian',
    gaussianMean: 13,
    gaussianStdDev: 2.5,
    impactCoefficients: SCOUT_IMPACT_COEFFICIENTS,
    currentRatio: [0.5, 0.8],
    abilityPool: SCOUT_ABILITY_POOL,
    abilityChance: SCOUT_ABILITY_CHANCE,
    revealedSkillCount: SCOUT_REVEALED_SKILL_COUNT,
    outfieldPositions: SCOUT_OUTFIELD_POSITIONS as unknown as string[],
    positionSkillImpact: SCOUT_POSITION_SKILL_IMPACT,
    goalkeeperChance: SCOUT_GOALKEEPER_CHANCE,
    ageRange: SENIOR_AGE_RANGE,
    pickRandomNationality: () => nationality,
    getRandomNameByNationality,
  });
  // The generator hands back its own internal records; we have to
  // project the same structure for the clamp pass.
  const current = flattenSkills(
    raw.currentSkills as unknown as Record<string, unknown>,
  );
  const potential = flattenSkills(
    raw.potentialSkills as unknown as Record<string, unknown>,
  );
  applySeniorSkillCaps(current, potential);
  return {
    ...raw,
    currentSkills: rebuildSkills(current, raw.isGoalkeeper),
    potentialSkills: rebuildSkills(potential, raw.isGoalkeeper),
  };
}

/** Pull every skill value (paced, strength, finishing, …) into a flat map. */
function flattenSkills(
  skills: Record<string, unknown>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cat of Object.values(skills)) {
    if (!cat || typeof cat !== 'object') continue;
    for (const [k, v] of Object.entries(cat as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = v;
      }
    }
  }
  return out;
}

/** Rebuild a flat skill map back into the nested PlayerSkills shape. */
function rebuildSkills(
  flat: Record<string, number>,
  isGoalkeeper: boolean,
): Record<string, unknown> {
  const outfieldPhysical = { pace: flat.pace, strength: flat.strength };
  const outfieldTechnical = {
    finishing: flat.finishing,
    passing: flat.passing,
    dribbling: flat.dribbling,
    defending: flat.defending,
  };
  const mental = { positioning: flat.positioning, composure: flat.composure };
  const setPieces = { freeKicks: flat.freeKicks, penalties: flat.penalties };
  if (isGoalkeeper) {
    return {
      physical: outfieldPhysical,
      technical: {
        reflexes: flat.reflexes,
        handling: flat.handling,
        aerial: flat.aerial,
      },
      mental,
      setPieces,
    };
  }
  return {
    physical: outfieldPhysical,
    technical: outfieldTechnical,
    mental,
    setPieces,
  };
}

@Injectable()
export class ScoutsService {
  constructor(
    @InjectRepository(ScoutCandidateEntity)
    private candidateRepo: Repository<ScoutCandidateEntity>,
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
    @InjectRepository(YouthTeamEntity)
    private youthTeamRepo: Repository<YouthTeamEntity>,
  ) {}

  /** Manual draws allowed per game-week per team. The auto-cron on
   *  Saturday does not consume this budget — it's the manager's
   *  personal draw allowance, independent of the cron-batched inbox. */
  static readonly WEEKLY_DRAW_CAP = 3;

  /** Generate a single scout candidate for a team.
   *  The inbox UX is "one card at a time" — the manager evaluates a
   *  single dossier, then SKIP / SIGN to move on. We keep the
   *  scheduler's auto-batch counterpart (which calls this method in a
   *  loop) intact, so the cron path still produces a fresh inbox every
   *  Saturday.
   *
   *  Enforces the per-team weekly cap of `WEEKLY_DRAW_CAP` (default
   *  3). The counter resets whenever the stored `scoutWeekIndex` no
   *  longer matches the current `currentWeekIndex()` — i.e. on the
   *  first manual draw after a week rollover.
   *
   *  The candidate's `expiresAt` is set to the end of the current
   *  game-week, so the inbox auto-prunes at the week boundary rather
   *  than after a fixed 7-day window. */
  async generateOneCandidate(teamId: Uuid): Promise<ScoutCandidateEntity> {
    // [D2] Pin the candidate's nationality to the team's own. The team
    // may be missing (e.g. orphaned cron run) — fall back to CN so the
    // generation still succeeds.
    const team = await this.teamRepo.findOneBy({ id: teamId });
    const nowWeek = currentWeekIndex();

    // Enforce weekly cap on manual draws. Skip the check when the
    // team row is missing (the cron path that falls through here with
    // a synthetic team would otherwise throw on a null team).
    if (team) {
      if (team.scoutWeekIndex !== nowWeek) {
        team.scoutDrawsThisWeek = 0;
        team.scoutWeekIndex = nowWeek;
      }
      if (team.scoutDrawsThisWeek >= ScoutsService.WEEKLY_DRAW_CAP) {
        throw new Error(
          `Weekly scout draw cap reached (${ScoutsService.WEEKLY_DRAW_CAP}/week). The counter resets at the next week boundary.`,
        );
      }
      team.scoutDrawsThisWeek += 1;
      await this.teamRepo.save(team);
    }

    // Tie candidate expiry to the week boundary, not a 7-day sliding
    // window — keeps cron + manual draws in lockstep.
    const expiresAt = endOfCurrentWeek();

    // [D1] Generation now goes through the shared utility, so scheduler
    // and API produce a consistent shape (revealedSkills/joinedAt included).
    const playerData = generatePlayerData(
      team ??
        ({ id: teamId, nationality: DEFAULT_TEAM_NATIONALITY } as TeamEntity),
    );
    const candidate = this.candidateRepo.create({
      teamId,
      playerData: {
        ...playerData,
        // The shared generator produces a potentialTier for every candidate;
        // only reveal it externally when potentialRevealed === true.
        potentialTier: playerData.potentialRevealed
          ? playerData.potentialTier
          : undefined,
      } as unknown as ScoutCandidatePlayerData,
      expiresAt,
    });
    return await this.candidateRepo.save(candidate);
  }

  /** Get all active candidates for a team */
  async getCandidates(teamId: string): Promise<ScoutCandidateEntity[]> {
    return this.candidateRepo.find({
      where: { teamId, expiresAt: MoreThanOrEqual(new Date()) },
      order: { createdAt: 'DESC' },
    });
  }

  /** Select a candidate → convert to a  row with
   *   and the reveal state copied from the candidate.
   *  After RFC 0001 there is no separate YouthPlayerEntity — youth
   *  players are PlayerEntity rows that carry the  and
   *   fields.
   *
   *  [S2] Caller MUST pass ; the candidate is rejected if it
   *  does not belong to that team. */
  async selectCandidate(
    candidateId: string,
    expectedTeamId: string,
  ): Promise<PlayerEntity> {
    const candidate = await this.candidateRepo.findOneByOrFail({
      id: candidateId,
    });
    if (candidate.teamId !== expectedTeamId) {
      throw new Error(
        `Candidate ${candidateId} does not belong to team ${expectedTeamId}`,
      );
    }
    const { playerData } = candidate;

    const youthTeam = await this.youthTeamRepo.findOne({
      where: { teamId: candidate.teamId },
    });
    const youthLeagueId = youthTeam?.youthLeagueId ?? null;

    // Recompute PA from the persisted potential-skills vector so the UI
    // badge reflects the candidate's *true* potential instead of a
    // placeholder 50. (See the unified PlayerEntity: potentialAbility
    // is a denormalized display field.)
    //
    // The api-local `calculatePotentialAbility` accepts the looser
    // `Record<string, number>` `technical` shape, so cast through
    // `unknown` (the runtime values match the closed union in
    // `@goalxi/database`; this is purely a TS shape bridge).
    const potentialAbility = calculatePotentialAbility(
      playerData.potentialSkills as unknown as Parameters<
        typeof calculatePotentialAbility
      >[0],
      playerData.isGoalkeeper,
    );

    // revealLevel is a coarse counter; the precise gate lives in
    // PROMOTION_REVEAL_THRESHOLD. The two must agree: revealLevel
    // = revealedSkills.length, so the promotion check is
    //   revealedSkills.length / keys.length >= 0.5
    // and revealLevel / keys.length >= 0.5. Keeping them aligned here
    // prevents the UI from showing a "ready to promote" badge that the
    // server would later reject.
    const totalKeys = getYouthSkillKeys(playerData.isGoalkeeper).length;
    const revealed = playerData.revealedSkills ?? [];
    const revealLevel = Math.min(revealed.length, totalKeys);

    // Senior-mode scouting: the candidate joins the senior squad
    // directly. `isYouth=false`, no youth-league binding, senior-level
    // wage, and a small sliver of pre-existing experience (a year or
    // two in a lower-division side is what the scout report
    // "17–18 year old" implies).
    const youth = this.playerRepo.create({
      teamId: candidate.teamId,
      name: playerData.name,
      nationality: playerData.nationality,
      isGoalkeeper: playerData.isGoalkeeper,
      isYouth: false,
      youthLeagueId: null,
      onTransfer: false,
      currentSkills: playerData.currentSkills,
      potentialSkills: playerData.potentialSkills,
      position: playerData.position ?? null,
      specialty: playerData.abilities?.[0] ?? null,
      // 0.5–3.0 years: a 17-year-old has at most a couple of senior
      // seasons under their belt, an 18-year-old might have a touch
      // more. The exact value doesn't matter much, it's enough to
      // stop the player from looking like a complete novice on day 1.
      experience: 0.5 + Math.random() * 2.5,
      form: 3,
      stamina: 3,
      matchMinutes: 0,
      // Senior wages: 8k–15k/w depending on potential tier — gives a
      // club a real "can we afford this kid?" moment when signing an
      // ELITE/LEGEND. Lower tiers anchor at 8k so we don't accidentally
      // price a bench warmer out of the squad.
      currentWage: 8000 + Math.floor(Math.random() * 7000),
      potentialAbility,
      careerStats: {
        club: {
          matches: 0,
          goals: 0,
          assists: 0,
          tackles: 0,
          yellowCards: 0,
          redCards: 0,
        },
      },
      currentInjuryValue: 0,
      revealLevel,
      revealedSkills: revealed,
      potentialRevealed: playerData.potentialRevealed,
      potentialTier: playerData.potentialTier,
      createdDay: playerData.createdDay ?? currentGameDay(),
    } as Partial<PlayerEntity>);

    await this.playerRepo.save(youth);
    await this.candidateRepo.delete({ id: candidateId });

    // [W] Saturate the per-team draw counter once a candidate has
    // been signed — the manager's pick for the week is "spent", and
    // the inbox shouldn't keep offering new dossiers until the next
    // week rolls over. We set the counter to `WEEKLY_DRAW_CAP`
    // (rather than just `+1`) so any subsequent draw attempt hits
    // the same guard as the raw 3-draw cap, regardless of how
    // many draws were used before the sign.
    const nowWeek = currentWeekIndex();
    const team = await this.teamRepo.findOneBy({
      id: candidate.teamId as Uuid,
    });
    if (team) {
      if (team.scoutWeekIndex !== nowWeek) {
        // Stale week — reset baseline before saturating so next
        // week's counter starts fresh.
        team.scoutDrawsThisWeek = 0;
        team.scoutWeekIndex = nowWeek;
      }
      team.scoutDrawsThisWeek = ScoutsService.WEEKLY_DRAW_CAP;
      await this.teamRepo.save(team);
    }
    return youth as PlayerEntity;
  }

  /** Skip a candidate → delete it */
  async skipCandidate(candidateId: string): Promise<void> {
    await this.candidateRepo.delete({ id: candidateId });
  }

  /** Clean up expired candidates */
  async cleanupExpired(): Promise<number> {
    const result = await this.candidateRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }
}

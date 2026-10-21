import { Uuid } from '@/common/types/common.type';
import { LeagueEntity, TeamEntity, UserEntity } from '@goalxi/database';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ListVisitsReqDto, RecordVisitReqDto } from './dto/visit.req.dto';
import { VisitListResDto, VisitorDto } from './dto/visit.res.dto';
import { VisitSubjectType } from './visit-subject.type';
import { VisitsRepository } from './visits.repository';

/**
 * How many members to pull out of Redis before filtering.
 *
 * The panel shows eight, but insiders are dropped after the read, so the scan
 * has to be deeper than the visible slice — otherwise a league whose top rows
 * are all its own clubs would render an empty panel while outsiders sit
 * further down the set.
 */
const SCAN_LIMIT = 200;

/** Start of the current UTC day, the same boundary the panel labels 今天. */
function todayMidnightUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly visits: VisitsRepository,
    @InjectRepository(TeamEntity)
    private readonly teams: Repository<TeamEntity>,
    @InjectRepository(LeagueEntity)
    private readonly leagues: Repository<LeagueEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  /**
   * Record that `visitorUserId` looked at `subject`.
   *
   * Every failure path is silent on purpose: a visit is telemetry, and
   * telemetry must never turn a page view into an error. The controller
   * answers 204 regardless of what happens here.
   */
  async record(dto: RecordVisitReqDto, visitorUserId: string): Promise<void> {
    if (
      await this.isOwnSubject(dto.subjectType, dto.subjectId, visitorUserId)
    ) {
      return;
    }
    if (!(await this.subjectExists(dto.subjectType, dto.subjectId))) return;

    try {
      await this.visits.record(dto.subjectType, dto.subjectId, visitorUserId);
    } catch (error) {
      this.logger.warn(
        `Could not record visit ${dto.subjectType}:${dto.subjectId} — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async list(dto: ListVisitsReqDto): Promise<VisitListResDto> {
    const limit = dto.limit ?? 8;

    let raw;
    try {
      raw = await this.visits.list(dto.subjectType, dto.subjectId, SCAN_LIMIT);
    } catch (error) {
      this.logger.warn(
        `Could not read visits ${dto.subjectType}:${dto.subjectId} — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { todayCount: 0, visitors: [] };
    }

    if (raw.visitors.length === 0) return { todayCount: 0, visitors: [] };

    // Filtering here as well as in `record()` is what makes the panel
    // self-healing: a set written before the insider rule existed still holds
    // those members until the three-day window expires, and the manager who
    // reported seeing himself had exactly that. Reading defensively means no
    // backfill job, no purge, and a correct panel one deploy after the rule.
    const excluded = await this.insiderIds(
      dto.subjectType,
      dto.subjectId,
      raw.visitors.map((v) => v.userId),
    );
    const midnightUtc = todayMidnightUtc();
    const survivors = raw.visitors.filter(
      (v) => !excluded.has(v.userId) && v.lastVisitAt.getTime() >= midnightUtc,
    );

    if (survivors.length === 0) return { todayCount: 0, visitors: [] };

    // One query for every visitor on the page instead of one per row.
    const users = await this.users.find({
      where: { id: In(survivors.map((v) => v.userId as Uuid)) },
      select: { id: true, nickname: true, username: true, avatar: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    const visitors: VisitorDto[] = [];
    let todayCount = 0;
    for (const visit of survivors) {
      const user = byId.get(visit.userId);
      // A deleted account leaves its id in the set until the window expires;
      // drop it rather than render a nameless row.
      if (!user) continue;
      todayCount += 1;
      if (visitors.length >= limit) continue;
      visitors.push({
        userId: user.id,
        displayName: user.nickname?.trim() || user.username,
        avatarUrl: user.avatar?.trim() ? user.avatar : null,
        lastVisitAt: visit.lastVisitAt.toISOString(),
      });
    }

    // Counted from the same filtered set as the rows, so the header can never
    // credit an insider (or a deleted account) with a visit the panel refuses
    // to show.
    return { todayCount, visitors };
  }

  /**
   * Who is disqualified from counting as a visitor of this subject.
   *
   * Mirrors `isOwnSubject` but works from the visitor list instead of a single
   * user id, so it covers every row in one round of queries.
   */
  private async insiderIds(
    type: VisitSubjectType,
    id: string,
    visitorIds: string[],
  ): Promise<Set<string>> {
    if (type === 'user') {
      return new Set([id]);
    }

    if (type === 'team') {
      const owner = await this.teams.findOne({
        where: { id: id as Uuid },
        select: { userId: true },
      });
      return new Set(owner?.userId ? [owner.userId] : []);
    }

    // League: everyone whose club plays in it.
    const members = await this.teams.find({
      where: { leagueId: id as Uuid, userId: In(visitorIds as Uuid[]) },
      select: { userId: true },
    });
    return new Set(
      members
        .map((m) => m.userId)
        .filter((v): v is string => typeof v === 'string'),
    );
  }

  /**
   * Your own presence is not a visit.
   *
   * A manager opening their own club page would otherwise sit at the top
   * of their own visitor list forever, and the panel is only interesting
   * when it shows other people.
   */
  private async isOwnSubject(
    type: VisitSubjectType,
    id: string,
    userId: string,
  ): Promise<boolean> {
    if (type === 'user') return id === userId;
    if (type === 'team') {
      return (
        (await this.teams.count({
          where: { id: id as Uuid, userId },
        })) > 0
      );
    }
    // A league is nobody's private property, but a manager whose club plays
    // in it is not an "outsider" either: counting the eight clubs in the
    // division as visitors of their own division tells nobody anything.
    return (
      (await this.teams.count({
        where: { leagueId: id as Uuid, userId },
      })) > 0
    );
  }

  /**
   * The ids arrive from a client, so they have to be checked against a
   * real row — otherwise anyone could POST random UUIDs and make the API
   * create unbounded Redis keys.
   */
  private async subjectExists(
    type: VisitSubjectType,
    id: string,
  ): Promise<boolean> {
    switch (type) {
      case 'team':
        return (await this.teams.count({ where: { id: id as Uuid } })) > 0;
      case 'league':
        return (await this.leagues.count({ where: { id: id as Uuid } })) > 0;
      case 'user':
        return (await this.users.count({ where: { id: id as Uuid } })) > 0;
    }
  }
}

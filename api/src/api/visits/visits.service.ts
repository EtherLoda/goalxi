import { Uuid } from '@/common/types/common.type';
import { LeagueEntity, TeamEntity, UserEntity } from '@goalxi/database';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ListVisitsReqDto, RecordVisitReqDto } from './dto/visit.req.dto';
import { VisitListResDto, VisitorDto } from './dto/visit.res.dto';
import { VisitSubjectType } from './visit-subject.type';
import { VisitsRepository } from './visits.repository';

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
      raw = await this.visits.list(dto.subjectType, dto.subjectId, limit);
    } catch (error) {
      this.logger.warn(
        `Could not read visits ${dto.subjectType}:${dto.subjectId} — ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { todayCount: 0, visitors: [] };
    }

    if (raw.visitors.length === 0) return { todayCount: 0, visitors: [] };

    // One query for every visitor on the page instead of one per row.
    const users = await this.users.find({
      where: { id: In(raw.visitors.map((v) => v.userId)) },
      select: { id: true, nickname: true, username: true, avatar: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    const visitors: VisitorDto[] = [];
    for (const visit of raw.visitors) {
      const user = byId.get(visit.userId);
      // A deleted account leaves its id in the set until the window expires;
      // drop it rather than render a nameless row.
      if (!user) continue;
      visitors.push({
        userId: user.id,
        displayName: user.nickname?.trim() || user.username,
        avatarUrl: user.avatar?.trim() ? user.avatar : null,
        lastVisitAt: visit.lastVisitAt.toISOString(),
      });
    }

    return { todayCount: raw.todayCount, visitors };
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
    // A league is nobody's private property.
    return false;
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

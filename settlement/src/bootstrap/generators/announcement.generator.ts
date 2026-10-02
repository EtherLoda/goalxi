import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AnnouncementEntity,
  AnnouncementType,
  GAME_SETTINGS,
  computeSeasonWeekOneMonday,
} from '@goalxi/database';

/**
 * Pinned "Season 1 starts soon" banner. The frontend
 * reads from the `announcement` table on every page
 * load, so writing a row here means a fresh
 * registration lands on a page that already has the
 * season-1 intro card on top.
 *
 * Idempotency + soft-archive contract:
 *
 *   - The current title is the "key" — a row with
 *     `title = TITLE` AND `type = FEATURE` is the
 *     live banner. If it exists, its `content` is
 *     refreshed (so a tweak to the banner copy on
 *     a code update propagates without manual SQL).
 *     If it doesn't, a new row is inserted.
 *   - Any OTHER active FEATURE row whose title
 *     doesn't match the current TITLE is
 *     "soft-archived" — `isActive` flipped to
 *     `false`. This handles the "we used to have
 *     'GoalXI 赛季 1 正式开幕' and we bumped it
 *     to 'GoalXI 赛季 1 现在开始'" case: the
 *     stale row is hidden from the active list
 *     but kept in the table for audit / history.
 *     The pre-archive implementation would have
 *     just appended the new row and left the
 *     old one visibly active forever (the
 *     `priority DESC` ordering claim in the
 *     historical docstring was wrong — both
 *     rows had `priority: 100`).
 *
 * The spec (`announcement.generator.spec.ts`) pins:
 *
 *   - First run inserts one active row.
 *   - Re-run with the same TITLE refreshes content
 *     in place (no duplicate row).
 *   - "Bump TITLE" archives the old row (isActive
 *     flips to false) and inserts the new one.
 *   - The DB has at most 1 active row per
 *     `(title, type=FEATURE)` pair after any init
 *     run.
 */
@Injectable()
export class AnnouncementGenerator {
  private static readonly TITLE = 'GoalXI 赛季 1 正式开幕';

  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(AnnouncementEntity)
    private readonly announcementRepo: Repository<AnnouncementEntity>,
  ) {}

  async generate(initDate: Date): Promise<void> {
    const weekOneMonday = computeSeasonWeekOneMonday(initDate);
    // First match lands on `MATCH_DAY_OFFSETS[0]` of that week (anchor
    // + 1 day at ROUNDS_PER_WEEK=3 — it used to be Wednesday, +2). Show
    // that date in the banner so a manager knows when to log in.
    const firstMatch = new Date(
      weekOneMonday.getTime() +
        GAME_SETTINGS.MATCH_DAY_OFFSETS[0] * 24 * 60 * 60 * 1000,
    );
    const firstMatchDateStr = firstMatch.toISOString().split('T')[0];
    const nextContent = this.buildBannerContent(firstMatchDateStr);

    // 1. Soft-archive any active FEATURE row whose
    //    title doesn't match the current TITLE.
    //    These are stale "previous-version" banners
    //    left over from a TITLE bump on a previous
    //    init. Without this step they stay active
    //    forever (both rows have `priority: 100`).
    const stale = await this.announcementRepo.find({
      where: {
        type: AnnouncementType.FEATURE,
        isActive: true,
      },
    });
    const toArchive = stale.filter(
      (a) => a.title !== AnnouncementGenerator.TITLE,
    );
    if (toArchive.length > 0) {
      await this.announcementRepo.save(
        toArchive.map((a) => ({ id: a.id, isActive: false })),
      );
      this.logger.info(
        `[AnnouncementGenerator] archived ${toArchive.length} stale FEATURE banner(s): ${toArchive
          .map((a) => a.title)
          .join(', ')}`,
      );
    }

    // 2. Upsert the current TITLE. Refresh the
    //    content so a copy tweak on a code update
    //    propagates without manual SQL.
    const existing = await this.announcementRepo.findOne({
      where: {
        title: AnnouncementGenerator.TITLE,
        type: AnnouncementType.FEATURE,
      },
    });
    if (existing) {
      existing.content = nextContent;
      // `isActive` is left as-is — if someone
      // explicitly archived the current banner
      // (e.g. off-season), re-running init
      // shouldn't auto-revive it.
      await this.announcementRepo.save(existing);
      this.logger.info(
        '[AnnouncementGenerator] refreshed season-1 banner (first match=' +
          `${firstMatchDateStr})`,
      );
      return;
    }

    const row = this.announcementRepo.create({
      title: AnnouncementGenerator.TITLE,
      content: nextContent,
      type: AnnouncementType.FEATURE,
      isActive: true,
      priority: 100,
    });
    await this.announcementRepo.save(row);
    this.logger.info(
      `[AnnouncementGenerator] created season-1 banner (first match=${firstMatchDateStr})`,
    );
  }

  private buildBannerContent(firstMatchDateStr: string): string {
    // Derived from MATCH_DAY_OFFSETS rather than spelled out. This line
    // is player-facing, and when round 0 moved from Wednesday to Tuesday
    // it went on advertising the wrong matchdays.
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const matchdays = GAME_SETTINGS.MATCH_DAY_OFFSETS.map(
      (d) => dayNames[d],
    ).join('、');

    return [
      '欢迎来到 GoalXI!',
      '',
      `第一场比赛将于 ${firstMatchDateStr} ${GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC}:00 UTC 准时开赛。`,
      `赛季第一周起点为周一 00:00 UTC,每周${matchdays}各有一场比赛,均为 ${GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC}:00 UTC 开球。`,
      '',
      '您可以现在选择一支 BOT 球队开始您的执教生涯。',
      '赛程、天气、青训(暂停)、转会市场均已就绪。',
      '',
      '祝您执教愉快!',
    ].join('\n');
  }
}

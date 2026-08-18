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
 * Idempotent: keyed on `title` + `type = FEATURE`.
 * Re-running init is a no-op when the banner is
 * already present. To replace the copy, change the
 * title (e.g. bump to "Season 1 starts NOW!") and the
 * old row is left in place but the new one supersedes
 * it visually because of the `priority DESC` ordering
 * the API uses to fetch the active list.
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
    // First match lands on Wednesday of that week
    // (anchor + 2 days). Show the Wed date in the
    // banner so a manager knows when to log in.
    const firstMatch = new Date(
      weekOneMonday.getTime() + 2 * 24 * 60 * 60 * 1000,
    );
    const firstMatchDateStr = firstMatch.toISOString().split('T')[0];

    const existing = await this.announcementRepo.findOne({
      where: {
        title: AnnouncementGenerator.TITLE,
        type: AnnouncementType.FEATURE,
      },
    });
    if (existing) {
      this.logger.info(
        '[AnnouncementGenerator] season-1 banner already present, skipping',
      );
      return;
    }

    const row = this.announcementRepo.create({
      title: AnnouncementGenerator.TITLE,
      content: [
        '欢迎来到 GoalXI!',
        '',
        `第一场比赛将于 ${firstMatchDateStr} ${GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC}:00 UTC 准时开赛。`,
        `赛季第一周起点为周一 00:00 UTC,每周三和周六各有一场比赛,均为 ${GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC}:00 UTC 开球。`,
        '',
        '您可以现在选择一支 BOT 球队开始您的执教生涯。',
        '赛程、天气、青训(暂停)、转会市场均已就绪。',
        '',
        '祝您执教愉快!',
      ].join('\n'),
      type: AnnouncementType.FEATURE,
      isActive: true,
      priority: 100,
    });
    await this.announcementRepo.save(row);
    this.logger.info(
      `[AnnouncementGenerator] created season-1 banner (first match=${firstMatchDateStr})`,
    );
  }
}

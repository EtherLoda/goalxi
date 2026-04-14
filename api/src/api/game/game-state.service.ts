import { GAME_SETTINGS } from '@goalxi/database';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GameStateService {
  // Game start date: Season 1, Week 1 begins at this date
  // Set so that 2026-04-14 = Season 4, Week 12
  private readonly GAME_START_DATE = new Date('2025-02-25T00:00:00Z');

  /**
   * Get current season and week based on time elapsed since game start
   * Time-driven: each season has 16 weeks, automatically advances
   */
  getCurrentSeasonWeek(): { season: number; week: number } {
    const now = new Date();
    const msPerWeek = GAME_SETTINGS.DAYS_PER_WEEK * 7 * 24 * 60 * 60 * 1000;

    const weeksElapsed = Math.floor(
      (now.getTime() - this.GAME_START_DATE.getTime()) / msPerWeek,
    );

    const season =
      Math.floor(weeksElapsed / GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;
    const week = (weeksElapsed % GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;

    return { season, week };
  }
}

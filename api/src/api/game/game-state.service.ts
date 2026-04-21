import { GAME_SETTINGS } from '@goalxi/database';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GameStateService {
  // Game start date: Season 1, Week 1 begins at this date
  private readonly GAME_START_DATE = new Date('2026-04-06T00:00:00Z');

  /**
   * Get current season and week based on time elapsed since game start
   * Time-driven: each season has 16 weeks, automatically advances
   */
  getCurrentSeasonWeek(): { season: number; week: number } {
    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    const weeksElapsed = Math.floor(
      (now.getTime() - this.GAME_START_DATE.getTime()) / msPerWeek,
    );

    const season =
      Math.floor(weeksElapsed / GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;
    const week = (weeksElapsed % GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;

    return { season, week };
  }
}

import { GAME_SETTINGS } from '@goalxi/database';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GameStateService {
  /**
   * Get current season and week based on time elapsed since game start.
   * Game start is the most recent Wednesday (or today if Wednesday).
   * This ensures reseeding on any day shows Week 1.
   */
  getCurrentSeasonWeek(): { season: number; week: number } {
    const now = new Date();
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    // Calculate most recent Wednesday: go back to Sunday of current week, then add 3 days
    // JavaScript setDate automatically handles month/year boundaries
    const gameStartDate = new Date(now);
    gameStartDate.setDate(gameStartDate.getDate() - gameStartDate.getDay() + 3);
    gameStartDate.setHours(0, 0, 0, 0);

    const weeksElapsed = Math.floor(
      (now.getTime() - gameStartDate.getTime()) / msPerWeek,
    );

    const season =
      Math.floor(weeksElapsed / GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;
    const week = (weeksElapsed % GAME_SETTINGS.SEASON_LENGTH_WEEKS) + 1;

    return { season, week };
  }
}

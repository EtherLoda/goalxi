import { currentSeasonWeek, resolveGameStart } from '@goalxi/database';
import { Injectable } from '@nestjs/common';

/**
 * Resolves the "what season / week is it right now?" question for
 * the public API.
 *
 * Previously this service used a "most recent Wednesday" algorithm
 * that produced a different answer on the same instant than the
 * other three sites that computed the same value (training tick,
 * finance-scheduler, staffs.service). All five now route through
 * the same pure function (`currentSeasonWeek`) anchored to the
 * same `gameStart` resolved from `process.env.GAME_START_DATE`
 * (with a "today UTC midnight" dev fallback).
 *
 * The anchor is captured once at construction so two requests
 * landing on either side of a midnight boundary agree on the week
 * they belong to within the same process.
 */
@Injectable()
export class GameStateService {
  private readonly gameStart: Date;

  constructor() {
    this.gameStart = resolveGameStart(process.env.GAME_START_DATE);
  }

  getCurrentSeasonWeek(): { season: number; week: number } {
    return currentSeasonWeek(new Date(), this.gameStart);
  }
}

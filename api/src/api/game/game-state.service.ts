import { currentSeasonWeek } from '@goalxi/database';
import { Injectable } from '@nestjs/common';

/**
 * Resolves the "what season / week is it right now?" question for
 * the public API.
 *
 * Previously this service used a "most recent Wednesday" algorithm
 * that produced a different answer on the same instant than the
 * other three sites that computed the same value (training tick,
 * finance-scheduler, staffs.service). That divergence was the
 * root cause of #16: a staff renewal would land in season 1 while
 * the same team's settlement tick for that moment wrote to
 * season 2.
 *
 * Now the service delegates to the shared pure function in
 * `@goalxi/database`, so every consumer — API, settlement workers,
 * future simulator hooks — sees the same number.
 */
@Injectable()
export class GameStateService {
  getCurrentSeasonWeek(): { season: number; week: number } {
    return currentSeasonWeek();
  }
}

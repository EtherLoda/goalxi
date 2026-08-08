import { FanEntity } from '../entities/fan.entity';

/**
 * Tier-step rewards applied to a team's `FanEntity` at the moment the
 * team's `leagueId` changes.
 *
 * Two pure functions, one per direction. Both mutate the passed
 * `fan` in place and return it (for chaining). The caller is
 * responsible for `await fanRepo.save(fan)` afterwards.
 *
 * ## Why pure (no DB, no service)?
 *
 * - Called from `PromotionRelegationService.swapTeamLeague` (Settlement),
 *   which is the single funnel for every `team.leagueId` mutation
 *   (direct promote/relegate + playoff-result swap). The pre-existing
 *   `FanService.weeklyUpdate` in the API also re-uses these to keep
 *   behaviour in lock-step — without sharing, the two code paths would
 *   drift the moment someone retunes the multipliers.
 * - Keeps the math testable without standing up a Nest container.
 *
 * ## Numbers
 *
 * Mirrors what `FanService.weeklyUpdate` always intended to do (and
 * what the original RFC called for). The multipliers are intentionally
 * simple — a 10% fan count swing matches the +1 / −1 league-tier
 * change well, and a ±20 emotion step is large enough to be felt but
 * small enough to leave headroom for the weekly tick to move things
 * further. See the spec (`fan-rewards.spec.ts`) for boundary cases.
 */

/** Promotion (tier up) — fans +10%, fanEmotion +20, recentForm cleared. */
export function applyPromotionReward(fan: FanEntity): FanEntity {
  fan.totalFans = Math.floor(fan.totalFans * 1.1);
  fan.fanEmotion = Math.min(100, fan.fanEmotion + 20);
  fan.recentForm = '';
  return fan;
}

/** Relegation (tier down) — fans −10%, fanEmotion −20, recentForm cleared. */
export function applyRelegationReward(fan: FanEntity): FanEntity {
  fan.totalFans = Math.floor(fan.totalFans * 0.9);
  fan.fanEmotion = Math.max(0, fan.fanEmotion - 20);
  fan.recentForm = '';
  return fan;
}

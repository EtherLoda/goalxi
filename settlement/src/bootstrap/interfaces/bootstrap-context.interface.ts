/**
 * BootstrapContext - Reserved shape for the day generators
 * need to share state. Currently empty: the historical
 * `systemUserId` / `botUserId` fields were dropped when
 * the `bot_manager` / `system@goalxi.com` system users
 * were removed (bot teams don't need a fake owner; the
 * system user wasn't actually used anywhere). Add fields
 * back here when a generator needs shared state.
 */

export interface BootstrapContext {
  // intentionally empty — see the docstring above
}

export interface BootstrapResult {
  leaguesCreated: number;
  teamsCreated: number;
  playersCreated: number;
  staffCreated: number;
  matchesCreated: number;
  weatherDaysGenerated: number;
  elapsedMs: number;
}

import { currentGameDay, GAME_SETTINGS, PlayerEntity } from '@goalxi/database';

describe('PlayerEntity age calculations', () => {
  // Pin both wall-clock and the imported `currentGameDay()` to a single
  // instant so `get daysAlive()` (which calls `currentGameDay()` with no
  // arg) returns the same value as our precomputed `TODAY`. The previous
  // version only pinned `TODAY` and broke the day the wall clock passed
  // 2026-06-30.
  const PINNED_INSTANT = new Date('2026-06-30T12:00:00Z');
  const TODAY = currentGameDay(PINNED_INSTANT);

  // `DAYS_PER_YEAR` rather than a literal. It was 112 (16-week seasons)
  // and is now 77 (11-week seasons); hardcoding it here meant this spec
  // silently started asserting the wrong ages the moment the season
  // length changed, which is precisely what it exists to catch.
  const YEAR = GAME_SETTINGS.DAYS_PER_YEAR;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(PINNED_INSTANT);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calculates age in years correctly', () => {
    // Player created 20 years 33 days ago → age should be 20, ageDays 33.
    const createdDay = TODAY - 20 * YEAR - 33;
    const player = new PlayerEntity({
      name: 'Test',
      createdDay,
      isYouth: false,
    });
    expect(player.age).toBe(20);
    expect(player.getExactAge()).toEqual([20, 33]);
  });

  it('handles youth flag independently of age', () => {
    const createdDay = TODAY - 18 * YEAR;
    const player = new PlayerEntity({
      name: 'Youth',
      createdDay,
      isYouth: true,
    });
    expect(player.age).toBe(18);
    expect(player.isYouth).toBe(true);
  });

  it('produces [0,0] on the day a player is created', () => {
    const player = new PlayerEntity({
      name: 'Newborn',
      createdDay: TODAY,
      isYouth: false,
    });
    expect(player.age).toBe(0);
    expect(player.getExactAge()).toEqual([0, 0]);
  });
});

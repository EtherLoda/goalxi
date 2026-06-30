import { currentGameDay, PlayerEntity } from '@goalxi/database';

describe('PlayerEntity age calculations', () => {
  // Pin "now" to today (2026-06-30) so the test is deterministic — we
  // want age to depend only on `createdDay`, not on wall-clock time.
  const TODAY = currentGameDay(new Date('2026-06-30T12:00:00Z'));

  it('calculates age in years correctly', () => {
    // Player created 20 years 33 days ago → age should be 20, ageDays 33.
    const createdDay = TODAY - 20 * 112 - 33;
    const player = new PlayerEntity({
      name: 'Test',
      createdDay,
      isYouth: false,
    });
    expect(player.age).toBe(20);
    expect(player.getExactAge()).toEqual([20, 33]);
  });

  it('handles youth flag independently of age', () => {
    const createdDay = TODAY - 18 * 112;
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

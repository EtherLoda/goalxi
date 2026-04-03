import { GAME_SETTINGS, PlayerEntity } from '@goalxi/database';

describe('PlayerEntity age calculations', () => {
  it('calculates age in years correctly', () => {
    const now = Date.now();
    const birthday = new Date(
      now - 20 * GAME_SETTINGS.MS_PER_YEAR - 33 * 24 * 60 * 60 * 1000,
    );
    const player = new PlayerEntity({
      name: 'Test',
      birthday,
      isYouth: false,
      appearance: {},
    });
    expect(player.age).toBe(20);
    expect(player.getExactAge()).toEqual([20, 33]);
  });

  it('handles youth flag independently of age', () => {
    const birthday = new Date(Date.now() - 18 * GAME_SETTINGS.MS_PER_YEAR);
    const player = new PlayerEntity({
      name: 'Youth',
      birthday,
      isYouth: true,
      appearance: {},
    });
    expect(player.age).toBe(18);
    expect(player.isYouth).toBe(true);
  });
});

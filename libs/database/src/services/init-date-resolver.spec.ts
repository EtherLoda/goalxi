import {
  computeSeasonWeekOneMonday,
  SYSTEM_CONFIG_INIT_DATE_KEY,
  resolveInitDate,
} from './init-date-resolver';
import { SystemConfigEntity } from '../entities/system-config.entity';
import { startOfUtcDay } from '../utils/game-clock';

describe('init-date-resolver', () => {
  describe('computeSeasonWeekOneMonday', () => {
    it('lands on next-week Monday when init is mid-week', () => {
      // Wed 2026-09-09 → next Mon is Mon 2026-09-14 (5 days out)
      const init = new Date('2026-09-09T00:00:00Z');
      expect(computeSeasonWeekOneMonday(init).toISOString()).toBe(
        '2026-09-14T00:00:00.000Z',
      );
    });

    it('still pushes a full week when init is itself a Monday', () => {
      // Mon 2026-09-07 → next Mon is Mon 2026-09-14 (7 days out)
      const init = new Date('2026-09-07T00:00:00Z');
      expect(computeSeasonWeekOneMonday(init).toISOString()).toBe(
        '2026-09-14T00:00:00.000Z',
      );
    });

    it('lands on next-upcoming Monday when init is a Sunday', () => {
      // Sun 2026-09-13 → next Mon is Mon 2026-09-14 (1 day out)
      const init = new Date('2026-09-13T00:00:00Z');
      expect(computeSeasonWeekOneMonday(init).toISOString()).toBe(
        '2026-09-14T00:00:00.000Z',
      );
    });

    it('returns 00:00:00.000Z on the result', () => {
      const init = new Date('2026-09-09T13:45:30Z');
      const out = computeSeasonWeekOneMonday(init);
      expect(out.getUTCHours()).toBe(0);
      expect(out.getUTCMinutes()).toBe(0);
      expect(out.getUTCSeconds()).toBe(0);
      expect(out.getUTCMilliseconds()).toBe(0);
    });
  });

  describe('resolveInitDate', () => {
    it('reads system_config.init_date when present', async () => {
      const manager = {
        findOne: jest.fn().mockResolvedValue(
          Object.assign(new SystemConfigEntity(), {
            key: SYSTEM_CONFIG_INIT_DATE_KEY,
            value: '2026-09-09',
          }),
        ),
      } as any;
      const out = await resolveInitDate(manager, '2026-01-01');
      expect(out.toISOString()).toBe('2026-09-09T00:00:00.000Z');
    });

    it('falls back to env when the row is missing', async () => {
      const manager = { findOne: jest.fn().mockResolvedValue(null) } as any;
      const out = await resolveInitDate(manager, '2026-01-01');
      expect(out).toEqual(startOfUtcDay(new Date('2026-01-01')));
    });

    it('falls back to env (today) when both row and env are missing', async () => {
      const manager = { findOne: jest.fn().mockResolvedValue(null) } as any;
      const out = await resolveInitDate(manager, undefined);
      // today at UTC midnight — assert by the shape, not the value
      expect(out.getUTCHours()).toBe(0);
    });
  });
});

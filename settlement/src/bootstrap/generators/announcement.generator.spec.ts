import { AnnouncementGenerator } from './announcement.generator';
import { LOGGER_SERVICE } from '@goalxi/logger';
import {
  AnnouncementEntity,
  AnnouncementType,
} from '@goalxi/database';

/**
 * Spec for the season-1 banner generator.
 *
 * The historical contract was "keyed on `title` +
 * `type = FEATURE`; re-running is a no-op when the
 * banner is already present". That left a hole:
 * if the `TITLE` constant ever changed between
 * init runs, the old row would be left active
 * forever (both rows had `priority: 100`, so
 * `priority DESC` did NOT make the new one win).
 *
 * The new contract:
 *
 *   1. On every run, soft-archive any active
 *      FEATURE row whose title doesn't match the
 *      current TITLE (`isActive: false`).
 *   2. Upsert the current TITLE row: refresh
 *      `content` in place if it already exists,
 *      insert if it doesn't.
 *
 * These tests pin both halves.
 */
describe('AnnouncementGenerator — season-1 banner', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  };

  // Hard-coded title used by the generator. The
  // test reads it via `(gen as any).constructor`
  // rather than duplicating the string — if the
  // constant ever changes, the assertions below
  // follow automatically.
  const CURRENT_TITLE = (AnnouncementGenerator as any).TITLE;

  function build() {
    // We model the announcement row with a `dirty`
    // flag so `save` mutates the local object the
    // same way TypeORM would (so assertions on
    // `existing.isActive` after `save` reflect the
    // post-save state).
    const rows: any[] = [];
    const announcementRepo = {
      find: jest.fn(async (opts: any) =>
        rows.filter(
          (r) =>
            (!opts.where.type || r.type === opts.where.type) &&
            (opts.where.isActive === undefined ||
              r.isActive === opts.where.isActive),
        ),
      ),
      findOne: jest.fn(async (opts: any) => {
        if (opts?.where?.id) {
          return rows.find((r) => r.id === opts.where.id) ?? null;
        }
        return (
          rows.find(
            (r) =>
              r.title === opts.where.title && r.type === opts.where.type,
          ) ?? null
        );
      }),
      create: jest.fn((data: any) => ({
        id: `mock-${Math.random().toString(36).slice(2, 9)}`,
        ...data,
      })),
      save: jest.fn(async (toSave: any) => {
        const list = Array.isArray(toSave) ? toSave : [toSave];
        for (const item of list) {
          const existing = rows.find((r) => r.id === item.id);
          if (existing) {
            Object.assign(existing, item);
          } else {
            rows.push({ ...item });
          }
        }
        return toSave;
      }),
      // The full row set is the test-only surface
      // the assertions use to verify "at most 1
      // active row per (title, type)" after the
      // generator runs.
      __rows: rows,
    };
    return {
      gen: new AnnouncementGenerator(
        mockLogger as any,
        announcementRepo as any,
      ),
      announcementRepo,
    };
  }

  const INIT_DATE = new Date('2026-09-09T00:00:00Z');

  beforeEach(() => {
    mockLogger.info.mockClear();
  });

  it('first run: inserts exactly one active FEATURE row with the current title', async () => {
    const { gen, announcementRepo } = build();
    await gen.generate(INIT_DATE);

    expect(announcementRepo.__rows).toHaveLength(1);
    const row = announcementRepo.__rows[0];
    expect(row.title).toBe(CURRENT_TITLE);
    expect(row.type).toBe(AnnouncementType.FEATURE);
    expect(row.isActive).toBe(true);
    expect(row.priority).toBe(100);
    expect(row.content).toContain('欢迎来到 GoalXI');
  });

  it('re-run with the same TITLE: refreshes content in place (no duplicate row)', async () => {
    // Regression: the historical code skipped on
    // match, which meant a content tweak on a
    // code update would never propagate. The new
    // contract is "upsert" — refresh content.
    const { gen, announcementRepo } = build();
    await gen.generate(INIT_DATE);
    // Mutate the row out from under the generator
    // (simulates a manual DB edit or a content
    // regression we want to overwrite).
    announcementRepo.__rows[0].content = 'STALE CONTENT';
    await gen.generate(INIT_DATE);

    // Still one row; content is the live banner
    // text again.
    expect(announcementRepo.__rows).toHaveLength(1);
    expect(announcementRepo.__rows[0].content).toContain(
      '欢迎来到 GoalXI',
    );
    expect(announcementRepo.__rows[0].content).not.toBe('STALE CONTENT');
  });

  it('re-run with the same TITLE does NOT auto-revive a manually-archived row', async () => {
    // If an operator manually flipped
    // `isActive = false` (e.g. the season-1 banner
    // should stay hidden until the next season),
    // re-running init should respect that — not
    // silently bring it back. The new contract
    // documents this; the test pins it.
    const { gen, announcementRepo } = build();
    await gen.generate(INIT_DATE);
    // Operator archives the live banner.
    announcementRepo.__rows[0].isActive = false;
    await gen.generate(INIT_DATE);

    // The row is still archived — `existing.content`
    // was refreshed but `isActive` was left as-is.
    expect(announcementRepo.__rows[0].isActive).toBe(false);
  });

  it('bumping TITLE (changing the constant): archives the stale row and inserts a new one', async () => {
    // The pre-fix code would have just appended
    // a new row and left the old one active
    // forever. The new contract:
    //   1. Find all active FEATURE rows whose
    //      title doesn't match the current TITLE
    //      → soft-archive (isActive = false).
    //   2. Upsert the current TITLE row.
    //
    // This test simulates a TITLE bump by
    // pre-seeding a "previous version" row with
    // a different title, then running init with
    // the current title.
    const { gen, announcementRepo } = build();
    // Pre-seed a stale "previous version" FEATURE
    // banner that's still active.
    announcementRepo.__rows.push({
      id: 'stale-1',
      title: 'GoalXI 赛季 1 (legacy)',
      content: 'OLD COPY',
      type: AnnouncementType.FEATURE,
      isActive: true,
      priority: 100,
    });
    await gen.generate(INIT_DATE);

    // Two rows: the stale one (now archived) and
    // the new current-title one (active).
    expect(announcementRepo.__rows).toHaveLength(2);
    const stale = announcementRepo.__rows.find(
      (r: any) => r.id === 'stale-1',
    );
    const live = announcementRepo.__rows.find(
      (r: any) => r.title === CURRENT_TITLE,
    );
    expect(stale.isActive).toBe(false);
    expect(stale.content).toBe('OLD COPY'); // not mutated
    expect(live.isActive).toBe(true);
    expect(live.content).toContain('欢迎来到 GoalXI');
  });

  it('after any init run, at most 1 active row exists per (title, type=FEATURE) pair', async () => {
    // The "no more than one live row" invariant.
    // Pre-seed several stale titles, run init
    // three times, and assert the invariant.
    const { gen, announcementRepo } = build();
    announcementRepo.__rows.push(
      { id: 'a', title: 'A', content: '', type: AnnouncementType.FEATURE, isActive: true, priority: 100 },
      { id: 'b', title: 'B', content: '', type: AnnouncementType.FEATURE, isActive: true, priority: 100 },
      { id: 'c', title: 'C', content: '', type: AnnouncementType.FEATURE, isActive: true, priority: 100 },
    );
    for (let i = 0; i < 3; i++) {
      await gen.generate(INIT_DATE);
    }
    const activeFeatureRows = announcementRepo.__rows.filter(
      (r: any) => r.type === AnnouncementType.FEATURE && r.isActive,
    );
    // Only the current-title row should be active.
    expect(activeFeatureRows).toHaveLength(1);
    expect(activeFeatureRows[0].title).toBe(CURRENT_TITLE);
  });

  it('source-level: TITLE is a private static (the upsert key is class-internal)', () => {
    // Belt-and-braces: pin the constant's
    // existence at the source level so a future
    // refactor that inlines the title string into
    // `generate()` doesn't silently re-open the
    // "changing title = leaving old rows active"
    // hole.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'announcement.generator.ts'),
      'utf8',
    );
    expect(source).toMatch(
      /private\s+static\s+readonly\s+TITLE\s*=/,
    );
  });
});

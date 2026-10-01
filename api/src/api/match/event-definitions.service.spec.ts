/**
 * EventDefinitionsService unit tests (RFC 0002 Phase 1).
 *
 * Light coverage — the service is a thin pass-through to the
 * two repositories. The interesting behavior is the sort
 * order: both `findAllClasses` and `findAllOutcomes` must
 * return rows in `sort_order` ASC so the FE renders in a
 * stable order without re-sorting on the client.
 */
import { EventDefinitionsService } from './event-definitions.service';

describe('EventDefinitionsService (RFC 0002 P1)', () => {
  function makeRepoStub(rows: any[]): any {
    return {
      find: jest.fn().mockImplementation(({ order }: any) => {
        // Mirror the service's `order: { sortOrder: 'ASC' }` so
        // the test can verify the call shape without a DB.
        if (order && order.sortOrder === 'ASC') {
          return Promise.resolve(
            [...rows].sort((a, b) => a.sortOrder - b.sortOrder),
          );
        }
        return Promise.resolve(rows);
      }),
    };
  }

  it('findAllClasses returns all class rows sorted by sortOrder ASC', async () => {
    const rows = [
      { id: 3, code: 'SHOT', sortOrder: 30 },
      { id: 1, code: 'KICKOFF', sortOrder: 10 },
      { id: 2, code: 'PERIOD', sortOrder: 20 },
    ];
    const svc = new EventDefinitionsService(
      makeRepoStub(rows),
      makeRepoStub([]),
    );
    const out = await svc.findAllClasses();
    expect(out.map((r) => r.sortOrder)).toEqual([10, 20, 30]);
    expect(out.map((r) => r.code)).toEqual(['KICKOFF', 'PERIOD', 'SHOT']);
  });

  it('findAllOutcomes returns all outcome rows sorted by sortOrder ASC', async () => {
    const rows = [
      { id: 4, code: 'MISS', sortOrder: 40 },
      { id: 1, code: 'GOAL', sortOrder: 10 },
      { id: 2, code: 'SAVE', sortOrder: 20 },
      { id: 3, code: 'BLOCKED', sortOrder: 30 },
    ];
    const svc = new EventDefinitionsService(
      makeRepoStub([]),
      makeRepoStub(rows),
    );
    const out = await svc.findAllOutcomes();
    expect(out.map((r) => r.code)).toEqual(['GOAL', 'SAVE', 'BLOCKED', 'MISS']);
  });

  it('findAllClasses returns [] when the table is empty', async () => {
    const svc = new EventDefinitionsService(makeRepoStub([]), makeRepoStub([]));
    expect(await svc.findAllClasses()).toEqual([]);
    expect(await svc.findAllOutcomes()).toEqual([]);
  });
});

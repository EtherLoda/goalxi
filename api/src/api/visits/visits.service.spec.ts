import { VisitsRepository } from './visits.repository';
import { VisitsService } from './visits.service';

const VISITOR = '00000000-0000-4000-8000-000000000001';
const TEAM = '00000000-0000-4000-8000-0000000000aa';

function buildService(overrides: {
  record?: jest.Mock;
  list?: jest.Mock;
  counts?: Record<string, number>;
  users?: unknown[];
  owned?: boolean;
}) {
  const visits = {
    record: overrides.record ?? jest.fn().mockResolvedValue(undefined),
    list:
      overrides.list ??
      jest.fn().mockResolvedValue({ todayCount: 0, visitors: [] }),
  };
  const counts = overrides.counts ?? { team: 1, league: 1, user: 1 };
  const owned = overrides.owned ?? false;
  const repo = (key: string) => ({
    // One repo answers two questions: does it exist, and is it yours.
    count: jest
      .fn()
      .mockImplementation((args?: { where?: { userId?: string } }) =>
        Promise.resolve(
          args?.where?.userId !== undefined
            ? owned
              ? 1
              : 0
            : (counts[key] ?? 0),
        ),
      ),
    find: jest.fn().mockResolvedValue(overrides.users ?? []),
  });

  return {
    visits,
    service: new VisitsService(
      visits as unknown as VisitsRepository,
      repo('team') as never,
      repo('league') as never,
      repo('user') as never,
    ),
  };
}

describe('VisitsService', () => {
  it('records a visit to a club that exists', async () => {
    const { service, visits } = buildService({});
    await service.record({ subjectType: 'team', subjectId: TEAM }, VISITOR);
    expect(visits.record).toHaveBeenCalledWith('team', TEAM, VISITOR);
  });

  it('ignores ids that do not point at a row', async () => {
    const { service, visits } = buildService({ counts: { team: 0 } });
    await service.record({ subjectType: 'team', subjectId: TEAM }, VISITOR);
    expect(visits.record).not.toHaveBeenCalled();
  });

  it('does not record someone visiting their own manager page', async () => {
    const { service, visits } = buildService({});
    await service.record({ subjectType: 'user', subjectId: VISITOR }, VISITOR);
    expect(visits.record).not.toHaveBeenCalled();
  });

  it('does not record you visiting your own club', async () => {
    const { service, visits } = buildService({ owned: true });
    await service.record({ subjectType: 'team', subjectId: TEAM }, VISITOR);
    expect(visits.record).not.toHaveBeenCalled();
  });

  it('does not record a manager whose club plays in that league', async () => {
    const { service, visits } = buildService({ owned: true });
    await service.record({ subjectType: 'league', subjectId: TEAM }, VISITOR);
    expect(visits.record).not.toHaveBeenCalled();
  });

  it('does record an outsider looking at a league', async () => {
    const { service, visits } = buildService({ owned: false });
    await service.record({ subjectType: 'league', subjectId: TEAM }, VISITOR);
    expect(visits.record).toHaveBeenCalledWith('league', TEAM, VISITOR);
  });

  it('swallows a Redis failure: a page view must never error', async () => {
    const { service } = buildService({
      record: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    await expect(
      service.record({ subjectType: 'team', subjectId: TEAM }, VISITOR),
    ).resolves.toBeUndefined();
  });

  it('hydrates visitors, falling back to the username', async () => {
    const { service } = buildService({
      list: jest.fn().mockResolvedValue({
        todayCount: 2,
        visitors: [
          { userId: VISITOR, lastVisitAt: new Date('2026-10-21T10:00:00Z') },
          { userId: 'gone', lastVisitAt: new Date('2026-10-21T09:00:00Z') },
        ],
      }),
      users: [{ id: VISITOR, nickname: null, username: 'sw1ng', avatar: '' }],
    });

    const res = await service.list({ subjectType: 'team', subjectId: TEAM });

    expect(res.todayCount).toBe(2);
    // The deleted account is dropped rather than rendered nameless.
    expect(res.visitors).toHaveLength(1);
    expect(res.visitors[0]).toEqual({
      userId: VISITOR,
      displayName: 'sw1ng',
      avatarUrl: null,
      lastVisitAt: '2026-10-21T10:00:00.000Z',
    });
  });

  it('prefers the nickname over the username', async () => {
    const { service } = buildService({
      list: jest.fn().mockResolvedValue({
        todayCount: 1,
        visitors: [
          { userId: VISITOR, lastVisitAt: new Date('2026-10-21T10:00:00Z') },
        ],
      }),
      users: [
        {
          id: VISITOR,
          nickname: ' McGrady ',
          username: 'mgrady',
          avatar: '/a.png',
        },
      ],
    });

    const res = await service.list({ subjectType: 'team', subjectId: TEAM });
    expect(res.visitors[0].displayName).toBe('McGrady');
    expect(res.visitors[0].avatarUrl).toBe('/a.png');
  });

  it('returns an empty panel instead of 500 when Redis is unavailable', async () => {
    const { service } = buildService({
      list: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    await expect(
      service.list({ subjectType: 'team', subjectId: TEAM }),
    ).resolves.toEqual({ todayCount: 0, visitors: [] });
  });

  it('defaults the limit to 8', async () => {
    const { service, visits } = buildService({});
    await service.list({ subjectType: 'team', subjectId: TEAM });
    expect(visits.list).toHaveBeenCalledWith('team', TEAM, 8);
  });
});

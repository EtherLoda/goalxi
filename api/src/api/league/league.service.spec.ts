import { Uuid } from '@/common/types/common.type';
import {
  ArchivedSeasonResultEntity,
  LeagueEntity,
  SeasonResultEntity,
} from '@goalxi/database';
import { LeagueService } from './league.service';

describe('LeagueService.getPastSeasons (regression for #20)', () => {
  let service: LeagueService;

  // The service uses static `Entity.find` calls so we monkey-patch
  // the repos rather than going through the DI container. Easier,
  // and matches how other services in this repo are tested.
  const repos: {
    league: jest.Mock;
    season: jest.Mock;
    archived: jest.Mock;
  } = {
    league: jest.fn(),
    season: jest.fn(),
    archived: jest.fn(),
  };

  beforeAll(() => {
    service = new LeagueService();
    jest
      .spyOn(LeagueEntity, 'findOne')
      .mockImplementation((opts: any) => repos.league(opts));
    jest
      .spyOn(SeasonResultEntity, 'find')
      .mockImplementation((opts: any) => repos.season(opts));
    jest
      .spyOn(ArchivedSeasonResultEntity, 'find')
      .mockImplementation((opts: any) => repos.archived(opts));
  });

  afterEach(() => {
    repos.league.mockReset();
    repos.season.mockReset();
    repos.archived.mockReset();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('returns the union of current and archived seasons, sorted descending, deduplicated', async () => {
    repos.season.mockResolvedValueOnce([{ season: 1 }, { season: 2 }]);
    repos.archived.mockResolvedValueOnce([
      { season: 2 },
      { season: 3 },
      { season: 4 },
    ]);

    const out = await service.getPastSeasons(
      '11111111-1111-1111-1111-111111111111' as Uuid,
    );

    expect(out).toEqual([
      { season: 4 },
      { season: 3 },
      { season: 2 },
      { season: 1 },
    ]);
    // Both queries ran with the same leagueId filter.
    expect(repos.season).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leagueId: '11111111-1111-1111-1111-111111111111',
        }),
        select: ['season'],
      }),
    );
    expect(repos.archived).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leagueId: '11111111-1111-1111-1111-111111111111',
        }),
        select: ['season'],
      }),
    );
  });

  it('returns an empty array when the league has no seasons yet', async () => {
    repos.season.mockResolvedValueOnce([]);
    repos.archived.mockResolvedValueOnce([]);

    const out = await service.getPastSeasons(
      '22222222-2222-2222-2222-222222222222' as Uuid,
    );
    expect(out).toEqual([]);
  });

  it('resolves a slug-style name to a UUID before querying', async () => {
    // "premier-league" -> "Premier League" lookup -> resolved UUID.
    repos.league.mockResolvedValueOnce({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Premier League',
    } as any);
    repos.season.mockResolvedValueOnce([{ season: 1 }]);
    repos.archived.mockResolvedValueOnce([]);

    const out = await service.getPastSeasons('premier-league' as Uuid);

    expect(out).toEqual([{ season: 1 }]);
    expect(repos.league).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'Premier League' } }),
    );
    expect(repos.season).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leagueId: '11111111-1111-1111-1111-111111111111' },
      }),
    );
  });

  it('throws NotFound when the slug does not match any league', async () => {
    repos.league.mockResolvedValueOnce(null);

    await expect(
      service.getPastSeasons('nope-not-a-league' as Uuid),
    ).rejects.toThrow(/League "nope-not-a-league" not found/);
  });
});

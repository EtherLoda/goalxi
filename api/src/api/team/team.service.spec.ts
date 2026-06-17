import {
  LeagueEntity,
  PlayerEntity,
  StaffEntity,
  TeamEntity,
  Uuid,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlayerService } from '../player/player.service';
import { UpdateTeamReqDto } from './dto/update-team.req.dto';
import { TeamService } from './team.service';

describe('TeamService — update', () => {
  let service: TeamService;
  let teamRepo: jest.Mocked<any>;
  let staffRepo: jest.Mocked<any>;

  const baseTeam = (overrides: Partial<TeamEntity> = {}): TeamEntity => {
    const team = new TeamEntity({
      id: 'team-1' as Uuid,
      userId: 'user-1' as Uuid,
      name: 'Original FC',
      shortCode: 'AAAAA',
      logoUrl: '',
      jerseyColorPrimary: '#FF0000',
      jerseyColorSecondary: '#FFFFFF',
      jerseyColorTertiary: '#000000',
      staminaTrainingIntensity: 0.1,
      trainingIntensityLastChangedAt: null,
    });
    Object.assign(team, overrides);
    return team;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        {
          provide: PlayerService,
          useValue: { generateRandom: jest.fn() },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: {
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            findOneByOrFail: jest.fn(),
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: {},
        },
        {
          provide: getRepositoryToken(LeagueEntity),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);
    teamRepo = module.get(getRepositoryToken(TeamEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));

    // The service uses the static TeamEntity.findOneByOrFail — spy on it so
    // tests can stub the returned team. Also stub the instance save() call
    // (TypeORM Active Record style).
    jest
      .spyOn(TeamEntity, 'findOneByOrFail')
      .mockImplementation((async () => null) as never);
    jest.spyOn(TeamEntity.prototype, 'save').mockImplementation(async function (
      this: TeamEntity,
    ) {
      return this;
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates name and nationality when provided', async () => {
    const team = baseTeam();
    (TeamEntity.findOneByOrFail as jest.Mock).mockResolvedValue(team);
    teamRepo.save.mockImplementation(async (t: TeamEntity) => t);

    const dto: UpdateTeamReqDto = { name: 'New FC', nationality: 'ES' };
    const result = await service.update('team-1' as Uuid, dto);

    expect(team.name).toBe('New FC');
    expect(team.nationality).toBe('ES');
    expect(result.name).toBe('New FC');
  });

  it('sets trainingIntensityLastChangedAt when staminaTrainingIntensity changes (§5.4)', async () => {
    const before = new Date('2026-01-01T00:00:00Z');
    const team = baseTeam({ trainingIntensityLastChangedAt: before });
    (TeamEntity.findOneByOrFail as jest.Mock).mockResolvedValue(team);
    teamRepo.save.mockImplementation(async (t: TeamEntity) => t);

    const dto: UpdateTeamReqDto = { staminaTrainingIntensity: 0.3 };
    await service.update('team-1' as Uuid, dto);

    expect(team.staminaTrainingIntensity).toBe(0.3);
    expect(team.trainingIntensityLastChangedAt).not.toEqual(before);
    expect(team.trainingIntensityLastChangedAt).toBeInstanceOf(Date);
  });

  it('does not bump trainingIntensityLastChangedAt when other fields change', async () => {
    const before = new Date('2026-01-01T00:00:00Z');
    const team = baseTeam({ trainingIntensityLastChangedAt: before });
    (TeamEntity.findOneByOrFail as jest.Mock).mockResolvedValue(team);
    teamRepo.save.mockImplementation(async (t: TeamEntity) => t);

    const dto: UpdateTeamReqDto = { name: 'Renamed' };
    await service.update('team-1' as Uuid, dto);

    expect(team.trainingIntensityLastChangedAt).toEqual(before);
  });
});

describe('TeamService — findOne id resolution', () => {
  let service: TeamService;

  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_CODE = 'ABCDE';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        {
          provide: PlayerService,
          useValue: { generateRandom: jest.fn() },
        },
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);

    jest
      .spyOn(TeamEntity, 'findOneByOrFail')
      .mockImplementation((async () => null) as never);
    jest
      .spyOn(TeamEntity, 'findOneBy')
      .mockImplementation((async () => null) as never);
    jest
      .spyOn(TeamEntity, 'findOne')
      .mockImplementation((async () => null) as never);
    // skip the auto-generate-players branch by reporting an existing roster
    jest.spyOn(PlayerEntity, 'countBy').mockResolvedValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves by UUID when the param is a UUID', async () => {
    const team = new TeamEntity({
      id: VALID_UUID as Uuid,
      name: 'FC',
      shortCode: 'AAAAA',
    });
    (TeamEntity.findOneByOrFail as jest.Mock).mockResolvedValue(team);

    const result = await service.findOne(VALID_UUID);

    expect(TeamEntity.findOneByOrFail).toHaveBeenCalledWith({ id: VALID_UUID });
    expect(TeamEntity.findOneBy).not.toHaveBeenCalled();
    expect(result.shortCode).toBe('AAAAA');
  });

  it('resolves by short code when the param is a 5-char code', async () => {
    const team = new TeamEntity({
      id: VALID_UUID as Uuid,
      name: 'FC',
      shortCode: VALID_CODE,
    });
    (TeamEntity.findOneBy as jest.Mock).mockResolvedValue(team);

    const result = await service.findOne(VALID_CODE.toLowerCase());

    expect(TeamEntity.findOneBy).toHaveBeenCalledWith({
      shortCode: VALID_CODE,
    });
    expect(TeamEntity.findOneByOrFail).not.toHaveBeenCalled();
    expect(result.id).toBe(VALID_UUID);
  });

  it('throws ValidationException for non-UUID, non-code input', async () => {
    await expect(service.findOne('!!!')).rejects.toThrow();
    expect(TeamEntity.findOneByOrFail).not.toHaveBeenCalled();
    expect(TeamEntity.findOneBy).not.toHaveBeenCalled();
  });

  it('throws ValidationException when the short code is valid but unknown', async () => {
    (TeamEntity.findOneBy as jest.Mock).mockResolvedValue(null);

    await expect(service.findOne(VALID_CODE)).rejects.toThrow();
  });
});

describe('TeamService — create auto-generates shortCode', () => {
  let service: TeamService;

  const USER_ID = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        {
          provide: PlayerService,
          useValue: { generateRandom: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: {
            create: jest.fn((data) => data),
            save: jest.fn(async (entity) => entity),
          },
        },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);

    // No existing team for this user
    jest.spyOn(TeamEntity, 'findOneBy').mockResolvedValue(null);
    // Short-code uniqueness check: first call is used by the user-exists
    // branch (returns null above); the shortCode check below uses
    // `findOne` — we mock it to report no collisions.
    jest.spyOn(TeamEntity, 'findOne').mockResolvedValue(null);
    // save() returns the entity itself
    jest.spyOn(TeamEntity.prototype, 'save').mockImplementation(async function (
      this: TeamEntity,
    ) {
      return this;
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('assigns a 5-char shortCode on the new team', async () => {
    const result = await service.create({
      userId: USER_ID,
      name: 'My FC',
    } as any);

    expect(result.shortCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it('regenerates if the first candidate already exists', async () => {
    // Pretend the first code we generate is already taken, the second is free.
    const seen: string[] = [];
    const findOneSpy = TeamEntity.findOne as unknown as jest.Mock;
    findOneSpy.mockImplementation(async (opts: any) => {
      const code = opts?.where?.shortCode;
      if (!code) return null;
      if (seen.length === 0) {
        seen.push(code);
        return { id: 'taken' };
      }
      return null;
    });

    const result = await service.create({
      userId: USER_ID,
      name: 'Retry FC',
    } as any);

    expect(result.shortCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBe(result.shortCode);
  });
});

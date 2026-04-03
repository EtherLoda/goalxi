import { PlayerEntity, TeamEntity, YouthPlayerEntity } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YouthService } from './youth.service';

describe('YouthService', () => {
  let service: YouthService;
  let youthRepo: jest.Mocked<Repository<YouthPlayerEntity>>;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;

  const createYouthPlayer = (overrides = {}): YouthPlayerEntity =>
    ({
      id: 'youth-1',
      teamId: 'team-1',
      name: 'Test Youth',
      birthday: new Date('2010-01-01'),
      nationality: 'BR',
      isGoalkeeper: false,
      isPromoted: false,
      revealLevel: 1,
      revealedSkills: ['pace', 'strength'],
      potentialRevealed: true,
      potentialTier: 'REGULAR',
      currentSkills: {
        physical: { pace: 10, strength: 10 },
        technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 },
        mental: { positioning: 10, composure: 10 },
        setPieces: { freeKicks: 10, penalties: 10 },
      },
      potentialSkills: {
        physical: { pace: 15, strength: 15 },
        technical: { finishing: 15, passing: 15, dribbling: 15, defending: 15 },
        mental: { positioning: 15, composure: 15 },
        setPieces: { freeKicks: 15, penalties: 15 },
      },
      joinedAt: new Date(),
      ...overrides,
    }) as YouthPlayerEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YouthService,
        {
          provide: getRepositoryToken(YouthPlayerEntity),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            findOneByOrFail: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: { save: jest.fn(), create: jest.fn() },
        },
        {
          provide: getRepositoryToken(TeamEntity),
          useValue: { findOneBy: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<YouthService>(YouthService);
    youthRepo = module.get(getRepositoryToken(YouthPlayerEntity));
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByTeam', () => {
    it('should return non-promoted youth players', async () => {
      const players = [createYouthPlayer()];
      youthRepo.find.mockResolvedValue(players);

      const result = await service.findByTeam('team-1');

      expect(youthRepo.find).toHaveBeenCalledWith({
        where: { teamId: 'team-1', isPromoted: false },
        order: { joinedAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('applyNaturalGrowth', () => {
    it('should slowly increase current skills toward potential', async () => {
      const youth = createYouthPlayer();

      await service.applyNaturalGrowth(youth);

      expect(youthRepo.save).toHaveBeenCalled();
      const saved = youthRepo.save.mock.calls[0][0] as YouthPlayerEntity;
      // Skills should not exceed potential
      expect((saved.currentSkills as any).physical.pace).toBeLessThanOrEqual(
        (saved.potentialSkills as any).physical.pace,
      );
    });

    it('should not exceed potential values', async () => {
      const youth = createYouthPlayer({
        currentSkills: {
          physical: { pace: 14.9, strength: 14.9 },
          technical: {
            finishing: 14.9,
            passing: 14.9,
            dribbling: 14.9,
            defending: 14.9,
          },
          mental: { positioning: 14.9, composure: 14.9 },
          setPieces: { freeKicks: 14.9, penalties: 14.9 },
        },
      });

      await service.applyNaturalGrowth(youth);

      const saved = youthRepo.save.mock.calls[0][0] as YouthPlayerEntity;
      expect((saved.currentSkills as any).physical.pace).toBeLessThanOrEqual(
        15,
      );
    });
  });

  describe('revealNextSkills', () => {
    it('should reveal 1-2 new skills', async () => {
      const youth = createYouthPlayer({ revealedSkills: ['pace'] });

      await service.revealNextSkills(youth);

      expect(youthRepo.save).toHaveBeenCalled();
      const saved = youthRepo.save.mock.calls[0][0] as YouthPlayerEntity;
      expect(saved.revealedSkills.length).toBeGreaterThanOrEqual(2);
    });

    it('should not reveal already revealed skills', async () => {
      const youth = createYouthPlayer({
        revealedSkills: ['pace', 'strength', 'finishing'],
      });

      await service.revealNextSkills(youth);

      const saved = youthRepo.save.mock.calls[0][0] as YouthPlayerEntity;
      expect(saved.revealedSkills).toContain('pace');
      expect(saved.revealedSkills).toContain('strength');
      expect(saved.revealedSkills).toContain('finishing');
    });
  });

  describe('promote', () => {
    it('should create senior player and mark youth as promoted', async () => {
      const youth = createYouthPlayer({
        revealedSkills: [
          'pace',
          'strength',
          'finishing',
          'passing',
          'dribbling',
          'defending',
          'positioning',
          'composure',
          'freeKicks',
          'penalties',
        ],
      });

      youthRepo.findOneByOrFail.mockResolvedValue(youth);
      playerRepo.create.mockImplementation((data) => data as PlayerEntity);
      playerRepo.save.mockImplementation((p) =>
        Promise.resolve(p as PlayerEntity),
      );
      youthRepo.save.mockImplementation((y) =>
        Promise.resolve(y as YouthPlayerEntity),
      );

      const result = await service.promote('youth-1');

      expect(playerRepo.create).toHaveBeenCalled();
      expect(playerRepo.save).toHaveBeenCalled();
      expect(youthRepo.save).toHaveBeenCalled();
      const savedYouth = youthRepo.save.mock.calls[0][0] as YouthPlayerEntity;
      expect(savedYouth.isPromoted).toBe(true);
      expect(result.name).toBe('Test Youth');
    });

    it('should throw if player already promoted', async () => {
      const youth = createYouthPlayer({ isPromoted: true });
      youthRepo.findOneByOrFail.mockResolvedValue(youth);

      await expect(service.promote('youth-1')).rejects.toThrow(
        'already promoted',
      );
    });
  });

  describe('findAllActive', () => {
    it('should return all non-promoted youth players', async () => {
      youthRepo.find.mockResolvedValue([createYouthPlayer()]);

      await service.findAllActive();

      expect(youthRepo.find).toHaveBeenCalledWith({
        where: { isPromoted: false },
      });
    });
  });
});

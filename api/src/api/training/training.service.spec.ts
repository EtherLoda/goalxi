import {
  CoachPlayerAssignmentEntity,
  PlayerEntity,
  StaffEntity,
  StaffLevel,
  StaffRole,
} from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingService } from './training.service';

describe('TrainingService', () => {
  let service: TrainingService;
  let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
  let staffRepo: jest.Mocked<Repository<StaffEntity>>;
  let assignmentRepo: jest.Mocked<Repository<CoachPlayerAssignmentEntity>>;

  const createPlayer = (overrides = {}): PlayerEntity =>
    ({
      id: 'player-1',
      name: 'Test Player',
      teamId: 'team-1',
      age: 20,
      fractionalAge: 20.5,
      isGoalkeeper: false,
      isYouth: false,
      currentSkills: {
        physical: { pace: 10, strength: 10 },
        technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 },
        mental: { positioning: 10, composure: 10 },
        setPieces: { freeKicks: 10, penalties: 10 },
      },
      potentialSkills: {
        physical: { pace: 17, strength: 17 },
        technical: { finishing: 17, passing: 17, dribbling: 17, defending: 17 },
        mental: { positioning: 17, composure: 17 },
        setPieces: { freeKicks: 17, penalties: 17 },
      },
      ...overrides,
    }) as unknown as PlayerEntity;

  const createStaff = (role: StaffRole, level: number): StaffEntity =>
    ({
      id: `staff-${role}`,
      teamId: 'team-1',
      name: 'Test Staff',
      role,
      level: level as StaffLevel,
      salary: 1000,
      contractExpiry: new Date(),
      autoRenew: true,
      isActive: true,
    }) as unknown as StaffEntity;

  const createAssignment = (
    coachId: string,
    playerId: string,
  ): CoachPlayerAssignmentEntity =>
    ({
      id: `assign-${coachId}-${playerId}`,
      coachId,
      playerId,
      trainingCategory: 'technical',
      assignedAt: new Date(),
    }) as unknown as CoachPlayerAssignmentEntity;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        {
          provide: getRepositoryToken(PlayerEntity),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(StaffEntity),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CoachPlayerAssignmentEntity),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TrainingService>(TrainingService);
    playerRepo = module.get(getRepositoryToken(PlayerEntity));
    staffRepo = module.get(getRepositoryToken(StaffEntity));
    assignmentRepo = module.get(
      getRepositoryToken(CoachPlayerAssignmentEntity),
    );
  });

  describe('getWeeklyTrainingPreview', () => {
    it('should return empty array when no players', async () => {
      staffRepo.find.mockResolvedValue([]);
      assignmentRepo.find.mockResolvedValue([]);
      playerRepo.find.mockResolvedValue([]);

      const result = await service.getWeeklyTrainingPreview('team-1', 0.1);

      expect(result).toEqual([]);
    });

    it('should return 0 weeklyPoints for unassigned players', async () => {
      const headCoach = createStaff(StaffRole.HEAD_COACH, 3);
      staffRepo.find.mockResolvedValue([headCoach]);
      assignmentRepo.find.mockResolvedValue([]);
      playerRepo.find.mockResolvedValue([
        createPlayer({ id: 'p1', name: 'Player 1' }),
      ]);

      const result = await service.getWeeklyTrainingPreview('team-1', 0.2);

      expect(result).toHaveLength(1);
      expect(result[0].weeklyPoints).toBe(0);
      expect(result[0].assignedCoachId).toBeUndefined();
    });

    it('should calculate weeklyPoints for assigned players', async () => {
      const headCoach = createStaff(StaffRole.HEAD_COACH, 5);
      const techCoach = createStaff(StaffRole.TECHNICAL_COACH, 5);
      staffRepo.find.mockResolvedValue([headCoach, techCoach]);

      const assignment = createAssignment(techCoach.id, 'player-1');
      assignmentRepo.find.mockResolvedValue([assignment]);

      const player = createPlayer({ id: 'player-1', name: 'Test Player' });
      playerRepo.find.mockResolvedValue([player]);

      const result = await service.getWeeklyTrainingPreview('team-1', 0.2);

      expect(result).toHaveLength(1);
      expect(result[0].weeklyPoints).toBeGreaterThan(0);
      expect(result[0].assignedCoachId).toBe(techCoach.id);
      expect(result[0].assignedCoachName).toBe(techCoach.name);
    });

    it('should skip youth players', async () => {
      staffRepo.find.mockResolvedValue([]);
      assignmentRepo.find.mockResolvedValue([]);
      playerRepo.find.mockResolvedValue([
        createPlayer({ id: 'p1', name: 'Adult', isYouth: false }),
        createPlayer({ id: 'p2', name: 'Youth', isYouth: true }),
      ]);

      const result = await service.getWeeklyTrainingPreview('team-1', 0.1);

      expect(result).toHaveLength(1);
      expect(result[0].playerName).toBe('Adult');
    });
  });
});

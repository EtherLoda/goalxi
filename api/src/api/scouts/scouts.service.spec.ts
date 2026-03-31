import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScoutsService } from './scouts.service';
import {
    ScoutCandidateEntity,
    YouthPlayerEntity,
    PlayerEntity,
    TeamEntity,
} from '@goalxi/database';

describe('ScoutsService', () => {
    let service: ScoutsService;
    let candidateRepo: jest.Mocked<Repository<ScoutCandidateEntity>>;
    let youthRepo: jest.Mocked<Repository<YouthPlayerEntity>>;
    let playerRepo: jest.Mocked<Repository<PlayerEntity>>;
    let teamRepo: jest.Mocked<Repository<TeamEntity>>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ScoutsService,
                {
                    provide: getRepositoryToken(ScoutCandidateEntity),
                    useValue: {
                        find: jest.fn(),
                        findOneByOrFail: jest.fn(),
                        save: jest.fn(),
                        delete: jest.fn(),
                        create: jest.fn(),
                    },
                },
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

        service = module.get<ScoutsService>(ScoutsService);
        candidateRepo = module.get(getRepositoryToken(ScoutCandidateEntity));
        youthRepo = module.get(getRepositoryToken(YouthPlayerEntity));
        playerRepo = module.get(getRepositoryToken(PlayerEntity));
        teamRepo = module.get(getRepositoryToken(TeamEntity));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('getCandidates', () => {
        it('should return only non-expired candidates', async () => {
            const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const candidates = [{ id: 'c1', expiresAt: futureDate }];
            candidateRepo.find.mockResolvedValue(candidates as ScoutCandidateEntity[]);

            const result = await service.getCandidates('team-1');

            expect(candidateRepo.find).toHaveBeenCalledWith({
                where: { teamId: 'team-1', expiresAt: expect.any(Object) },
                order: { createdAt: 'DESC' },
            });
            expect(result).toHaveLength(1);
        });
    });

    describe('selectCandidate', () => {
        it('should create youth player from candidate and delete candidate', async () => {
            const candidate = {
                id: 'candidate-1',
                teamId: 'team-1',
                playerData: {
                    name: 'Test Player',
                    birthday: new Date('2010-01-01'),
                    nationality: 'GB',
                    isGoalkeeper: false,
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
                    abilities: ['header_specialist'],
                    potentialTier: 'REGULAR',
                    potentialRevealed: true,
                    revealedSkills: ['pace', 'strength'],
                    joinedAt: new Date(),
                },
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            };

            candidateRepo.findOneByOrFail.mockResolvedValue(candidate as ScoutCandidateEntity);
            youthRepo.create.mockImplementation((data) => data as YouthPlayerEntity);
            youthRepo.save.mockImplementation((y) => Promise.resolve(y as YouthPlayerEntity));
            candidateRepo.delete.mockResolvedValue({ affected: 1 } as any);

            const result = await service.selectCandidate('candidate-1');

            expect(youthRepo.create).toHaveBeenCalled();
            expect(youthRepo.save).toHaveBeenCalled();
            expect(candidateRepo.delete).toHaveBeenCalledWith({ id: 'candidate-1' });
            expect(result.name).toBe('Test Player');
            expect(result.abilities).toEqual(['header_specialist']);
        });
    });

    describe('skipCandidate', () => {
        it('should delete the candidate', async () => {
            candidateRepo.delete.mockResolvedValue({ affected: 1 } as any);

            await service.skipCandidate('candidate-1');

            expect(candidateRepo.delete).toHaveBeenCalledWith({ id: 'candidate-1' });
        });
    });

    describe('cleanupExpired', () => {
        it('should delete expired candidates', async () => {
            candidateRepo.delete.mockResolvedValue({ affected: 5 } as any);

            const result = await service.cleanupExpired();

            expect(candidateRepo.delete).toHaveBeenCalled();
            expect(result).toBe(5);
        });
    });
});

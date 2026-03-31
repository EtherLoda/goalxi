import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThan } from 'typeorm';
import { ScoutSchedulerService } from './scout-scheduler.service';
import {
    ScoutCandidateEntity,
    YouthPlayerEntity,
    TeamEntity,
} from '@goalxi/database';

describe('ScoutSchedulerService', () => {
    let service: ScoutSchedulerService;
    let youthRepo: jest.Mocked<Repository<YouthPlayerEntity>>;
    let teamRepo: jest.Mocked<Repository<TeamEntity>>;
    let candidateRepo: jest.Mocked<Repository<ScoutCandidateEntity>>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ScoutSchedulerService,
                {
                    provide: getRepositoryToken(YouthPlayerEntity),
                    useValue: { find: jest.fn(), save: jest.fn() },
                },
                {
                    provide: getRepositoryToken(TeamEntity),
                    useValue: { find: jest.fn() },
                },
                {
                    provide: getRepositoryToken(ScoutCandidateEntity),
                    useValue: {
                        find: jest.fn(),
                        save: jest.fn(),
                        create: jest.fn(),
                        delete: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<ScoutSchedulerService>(ScoutSchedulerService);
        youthRepo = module.get(getRepositoryToken(YouthPlayerEntity));
        teamRepo = module.get(getRepositoryToken(TeamEntity));
        candidateRepo = module.get(getRepositoryToken(ScoutCandidateEntity));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('generateScoutCandidates', () => {
        it('should generate 3 candidates per team', async () => {
            const teams = [{ id: 'team-1' }, { id: 'team-2' }];
            teamRepo.find.mockResolvedValue(teams as TeamEntity[]);
            candidateRepo.find.mockResolvedValue([]); // no existing candidates
            candidateRepo.delete.mockResolvedValue({ affected: 0 } as any);
            candidateRepo.create.mockImplementation((data) => data as ScoutCandidateEntity);
            candidateRepo.save.mockImplementation((c) => Promise.resolve(c as ScoutCandidateEntity));

            await service.generateScoutCandidates();

            expect(teamRepo.find).toHaveBeenCalled();
            // 2 teams × 3 candidates = 6 saves
            expect(candidateRepo.save).toHaveBeenCalledTimes(6);
        });

        it('should skip teams that already have candidates this week', async () => {
            const teams = [{ id: 'team-1' }];
            teamRepo.find.mockResolvedValue(teams as TeamEntity[]);

            // Existing candidate with future expiry = already generated this week
            const existingCandidate = {
                id: 'candidate-1',
                teamId: 'team-1',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            };
            candidateRepo.find.mockResolvedValue([existingCandidate as ScoutCandidateEntity]);
            candidateRepo.delete.mockResolvedValue({ affected: 0 } as any);

            await service.generateScoutCandidates();

            // No new candidates should be saved for team-1
            expect(candidateRepo.save).not.toHaveBeenCalled();
        });

        it('should delete expired candidates before generating', async () => {
            const teams = [{ id: 'team-1' }];
            teamRepo.find.mockResolvedValue(teams as TeamEntity[]);
            candidateRepo.find.mockResolvedValue([] as ScoutCandidateEntity[]);
            candidateRepo.create.mockImplementation((data) => data as ScoutCandidateEntity);
            candidateRepo.save.mockImplementation((c) => Promise.resolve(c as ScoutCandidateEntity));

            await service.generateScoutCandidates();

            expect(candidateRepo.delete).toHaveBeenCalled();
        });
    });

    describe('growAndRevealYouthPlayers', () => {
        it('should apply growth and reveal to youth players', async () => {
            const youthPlayer = {
                id: 'youth-1',
                teamId: 'team-1',
                name: 'Test Player',
                isGoalkeeper: false,
                isPromoted: false,
                revealLevel: 1,
                revealedSkills: ['pace', 'strength'],
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
            } as YouthPlayerEntity;

            youthRepo.find.mockResolvedValue([youthPlayer]);
            youthRepo.save.mockImplementation((y) => Promise.resolve(y as YouthPlayerEntity));

            await service.growAndRevealYouthPlayers();

            expect(youthRepo.save).toHaveBeenCalled();
            const savedPlayer = youthRepo.save.mock.calls[0][0] as YouthPlayerEntity;
            // revealLevel should increase
            expect(savedPlayer.revealLevel).toBe(2);
        });

        it('should only process non-promoted youth players', async () => {
            youthRepo.find.mockResolvedValue([] as YouthPlayerEntity[]);

            await service.growAndRevealYouthPlayers();

            expect(youthRepo.find).toHaveBeenCalledWith({ where: { isPromoted: false } });
            expect(youthRepo.save).not.toHaveBeenCalled();
        });

        it('should reveal 1-2 skills each week', async () => {
            const youthPlayer = {
                id: 'youth-1',
                isGoalkeeper: false,
                isPromoted: false,
                revealLevel: 1,
                revealedSkills: ['pace'],
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
            } as YouthPlayerEntity;

            youthRepo.find.mockResolvedValue([youthPlayer]);
            youthRepo.save.mockImplementation((y) => Promise.resolve(y as YouthPlayerEntity));

            await service.growAndRevealYouthPlayers();

            const savedPlayer = youthRepo.save.mock.calls[0][0] as YouthPlayerEntity;
            // Should have revealed 1-2 new skills
            expect(savedPlayer.revealedSkills.length).toBeGreaterThanOrEqual(2);
        });
    });
});

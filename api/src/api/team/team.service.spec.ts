import { LeagueEntity, StaffEntity, StaffLevel, StaffRole, TeamEntity, Uuid } from '@goalxi/database';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UpdateTeamReqDto } from './dto/update-team.req.dto';
import { TeamService } from './team.service';
import { PlayerService } from '../player/player.service';

describe('TeamService — update', () => {
    let service: TeamService;
    let teamRepo: jest.Mocked<any>;
    let staffRepo: jest.Mocked<any>;

    const baseTeam = (overrides: Partial<TeamEntity> = {}): TeamEntity => {
        const team = new TeamEntity({
            id: 'team-1' as Uuid,
            userId: 'user-1' as Uuid,
            name: 'Original FC',
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
        jest
            .spyOn(TeamEntity.prototype, 'save')
            .mockImplementation((async function (this: TeamEntity) {
                return this;
            }) as never);
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

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FanService } from './fan.service';
import { FanEntity } from '@goalxi/database';

describe('FanService', () => {
    let service: FanService;
    let fanRepository: Repository<FanEntity>;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FanService,
                {
                    provide: getRepositoryToken(FanEntity),
                    useValue: {
                        findOne: jest.fn(),
                        create: jest.fn(),
                        save: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<FanService>(FanService);
        fanRepository = module.get<Repository<FanEntity>>(getRepositoryToken(FanEntity));
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('calculateAttendance', () => {
        const capacity = 10000;

        it('should return 3000 for zero fans (neutral only)', () => {
            const attendance = service.calculateAttendance(0, 0, 50, 50, capacity);
            // neutral = capacity * 0.3 / (1 + 0/5000) = 3000
            expect(attendance).toBe(3000);
        });

        it('should calculate attendance for small fan base', () => {
            // 1000 home fans, 0 away fans, 50 morale
            // neutral = 10000 * 0.3 / (1 + 1000/5000) = 2500
            // home = 1000 * 0.2 * 0.8 = 160
            // total = 2660
            const attendance = service.calculateAttendance(1000, 0, 50, 50, capacity);
            expect(attendance).toBe(2660);
        });

        it('should cap attendance at stadium capacity', () => {
            // Very large fan base should hit capacity
            const attendance = service.calculateAttendance(100000, 100000, 100, 100, capacity);
            expect(attendance).toBeLessThanOrEqual(capacity);
        });

        it('should consider home morale in home fan attendance', () => {
            const lowMorale = service.calculateAttendance(10000, 0, 20, 50, capacity);
            const highMorale = service.calculateAttendance(10000, 0, 100, 50, capacity);

            // High morale should result in more attendance
            expect(highMorale).toBeGreaterThan(lowMorale);
        });

        it('should consider away morale in away fan attendance', () => {
            const lowMorale = service.calculateAttendance(0, 10000, 50, 20, capacity);
            const highMorale = service.calculateAttendance(0, 10000, 50, 100, capacity);

            // High morale should result in more attendance
            expect(highMorale).toBeGreaterThan(lowMorale);
        });

        it('should handle only home fans', () => {
            const attendance = service.calculateAttendance(10000, 0, 50, 50, capacity);
            // neutral = 10000 * 0.3 / (1 + 10000/5000) = 1000
            // home = 10000 * 0.2 * 0.8 = 1600
            // total = 2600
            expect(attendance).toBe(2600);
        });

        it('should handle only away fans', () => {
            const attendance = service.calculateAttendance(0, 10000, 50, 50, capacity);
            // neutral = 10000 * 0.3 / (1 + 10000/5000) = 1000
            // away = 10000 * 0.08 * 0.8 = 640
            // total = 1640
            expect(attendance).toBe(1640);
        });

        it('should combine all attendance sources', () => {
            const attendance = service.calculateAttendance(10000, 5000, 50, 50, capacity);
            // neutral = 10000 * 0.3 / (1 + 15000/5000) = 750
            // home = 10000 * 0.2 * 0.8 = 1600
            // away = 5000 * 0.08 * 0.8 = 320
            // total = 2670
            expect(attendance).toBe(2670);
        });
    });
});

import { TeamEntity } from './team.entity';
import { StadiumEntity } from './stadium.entity';

/**
 * §5 俱乐部设置页 — 实体字段 smoke test
 * 验证新字段可在 entity 上赋值（编译期 + 运行期），并保持现有字段不被破坏。
 */
describe('TeamEntity — §5.1 settings 字段', () => {
    it('should accept foundedYear value', () => {
        const team = new TeamEntity();
        team.foundedYear = 1899;
        expect(team.foundedYear).toBe(1899);
    });

    it('should accept city value', () => {
        const team = new TeamEntity();
        team.city = 'Manchester';
        expect(team.city).toBe('Manchester');
    });

    it('should accept bio value', () => {
        const team = new TeamEntity();
        team.bio = 'A historic club...';
        expect(team.bio).toBe('A historic club...');
    });

    it('should accept jerseyColorTertiary value', () => {
        const team = new TeamEntity();
        team.jerseyColorTertiary = '#000000';
        expect(team.jerseyColorTertiary).toBe('#000000');
    });

    it('should keep existing fields (regression)', () => {
        const team: TeamEntity = new TeamEntity();
        team.name = 'Test FC';
        team.nationality = 'GB';
        team.logoUrl = 'https://cdn.goalxi.com/test.png';
        team.jerseyColorPrimary = '#FF0000';
        team.jerseyColorSecondary = '#FFFFFF';
        team.jerseyColorTertiary = '#000000';
        team.benchConfig = null;
        expect(team.name).toBe('Test FC');
        expect(team.nationality).toBe('GB');
        expect(team.jerseyColorPrimary).toBe('#FF0000');
        expect(team.jerseyColorSecondary).toBe('#FFFFFF');
        expect(team.jerseyColorTertiary).toBe('#000000');
        expect(team.benchConfig).toBeNull();
    });
});

describe('StadiumEntity — §5.3 settings 字段', () => {
    it('should accept name value', () => {
        const stadium = new StadiumEntity();
        stadium.name = 'Old Trafford';
        expect(stadium.name).toBe('Old Trafford');
    });

    it('should keep existing fields (regression)', () => {
        const stadium: StadiumEntity = new StadiumEntity();
        stadium.teamId = '00000000-0000-0000-0000-000000000000';
        stadium.capacity = 75000;
        stadium.isBuilt = true;
        stadium.name = 'Home Stadium';
        expect(stadium.teamId).toBe('00000000-0000-0000-0000-000000000000');
        expect(stadium.capacity).toBe(75000);
        expect(stadium.isBuilt).toBe(true);
    });
});

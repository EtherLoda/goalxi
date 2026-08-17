import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTeamReqDto } from './update-team.req.dto';

describe('UpdateTeamReqDto — §5.1 字段校验', () => {
  const toDto = (data: Record<string, unknown>) =>
    plainToInstance(UpdateTeamReqDto, data);

  describe('jerseyColorTertiary', () => {
    it('should accept valid hex color #RRGGBB', async () => {
      const dto = toDto({ jerseyColorTertiary: '#000000' });
      const errors = await validate(dto);
      const errs = errors.filter((e) => e.property === 'jerseyColorTertiary');
      expect(errs).toHaveLength(0);
    });

    it('should reject malformed color', async () => {
      const dto = toDto({ jerseyColorTertiary: 'red' });
      const errors = await validate(dto);
      const errs = errors.filter((e) => e.property === 'jerseyColorTertiary');
      expect(errs.length).toBeGreaterThan(0);
    });
  });

  describe('bio', () => {
    it('should accept bio up to 2000 chars', async () => {
      const dto = toDto({ bio: 'A'.repeat(2000) });
      const errors = await validate(dto);
      const errs = errors.filter((e) => e.property === 'bio');
      expect(errs).toHaveLength(0);
    });

    it('should reject bio > 2000 chars', async () => {
      const dto = toDto({ bio: 'A'.repeat(2001) });
      const errors = await validate(dto);
      const errs = errors.filter((e) => e.property === 'bio');
      expect(errs.length).toBeGreaterThan(0);
    });
  });

  describe('logoUrl', () => {
    it('should accept valid https URL', async () => {
      const dto = toDto({ logoUrl: 'https://cdn.goalxi.com/x.png' });
      const errors = await validate(dto);
      const errs = errors.filter((e) => e.property === 'logoUrl');
      expect(errs).toHaveLength(0);
    });
  });

  describe('regression — existing fields still optional', () => {
    it('should pass with empty body', async () => {
      const dto = toDto({});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass with name only', async () => {
      const dto = toDto({ name: 'Updated FC' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('registration-locked fields are absent from the DTO', () => {
    // `nationality`, `city`, and `foundedYear` are set at team
    // creation (or, for manager-owned teams, at the onboarding-
    // claim moment) and must never be edited afterwards. The
    // DTO is the contract: if a future change re-introduces any
    // of these as editable properties, this test will start
    // reporting a present-where-expect-absent failure, and the
    // reviewer is forced to think about whether the lockdown
    // policy is being lifted deliberately.
    it('the DTO has no nationality, city, or foundedYear keys', () => {
      const dto = toDto({});
      expect(dto).not.toHaveProperty('nationality');
      expect(dto).not.toHaveProperty('city');
      expect(dto).not.toHaveProperty('foundedYear');
    });
  });
});


import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTeamReqDto } from './update-team.req.dto';

describe('UpdateTeamReqDto — §5.1 字段校验', () => {
  const toDto = (data: Record<string, unknown>) =>
    plainToInstance(UpdateTeamReqDto, data);

  describe('city', () => {
    it('should accept valid city name', async () => {
      const dto = toDto({ city: 'Manchester' });
      const errors = await validate(dto);
      const cityErrors = errors.filter((e) => e.property === 'city');
      expect(cityErrors).toHaveLength(0);
    });

    it('should reject city longer than 64 chars', async () => {
      const dto = toDto({ city: 'A'.repeat(65) });
      const errors = await validate(dto);
      const cityErrors = errors.filter((e) => e.property === 'city');
      expect(cityErrors.length).toBeGreaterThan(0);
    });

    it('should accept null city (optional)', async () => {
      const dto = toDto({ city: null });
      const errors = await validate(dto);
      const cityErrors = errors.filter((e) => e.property === 'city');
      expect(cityErrors).toHaveLength(0);
    });
  });

  describe('foundedYear', () => {
    it('should accept year 1850-present', async () => {
      const dto = toDto({ foundedYear: 1899 });
      const errors = await validate(dto);
      const errs = errors.filter((e) => e.property === 'foundedYear');
      expect(errs).toHaveLength(0);
    });

    it('should reject year < 1850', async () => {
      const dto = toDto({ foundedYear: 1700 });
      const errors = await validate(dto);
      const errs = errors.filter((e) => e.property === 'foundedYear');
      expect(errs.length).toBeGreaterThan(0);
    });

    it('should reject non-integer year', async () => {
      const dto = toDto({ foundedYear: 1899.5 });
      const errors = await validate(dto);
      const errs = errors.filter((e) => e.property === 'foundedYear');
      expect(errs.length).toBeGreaterThan(0);
    });
  });

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
});

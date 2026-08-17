import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BenchConfigBodyDto,
  UpdateBenchConfigReqDto,
} from './update-bench-config.req.dto';

describe('UpdateBenchConfigReqDto — DTO validation', () => {
  const toDto = (data: unknown): UpdateBenchConfigReqDto =>
    plainToInstance(UpdateBenchConfigReqDto, data);

  describe('happy path', () => {
    it('accepts a fully-populated bench with valid playerIds', async () => {
      const dto = toDto({
        benchConfig: {
          goalkeeper: 1,
          centerBack: 2,
          fullback: 3,
          winger: 4,
          centralMidfield: 5,
          forward: 6,
        },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts all-null bench (clears every slot)', async () => {
      const dto = toDto({
        benchConfig: {
          goalkeeper: null,
          centerBack: null,
          fullback: null,
          winger: null,
          centralMidfield: null,
          forward: null,
        },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts a partial bench (only goalkeeper filled)', async () => {
      const dto = toDto({
        benchConfig: { goalkeeper: 42 },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('coerces numeric strings into numbers (transform)', async () => {
      // The global ValidationPipe runs with `transform: true`, so a
      // stringified integer is parsed before the int check runs.
      const dto = toDto({
        benchConfig: { goalkeeper: '7' as unknown as number },
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('shape errors', () => {
    it('rejects a body with no `benchConfig` wrapper', async () => {
      const dto = toDto({ goalkeeper: 1 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('benchConfig');
    });

    it('rejects negative playerIds', async () => {
      const dto = toDto({
        benchConfig: { goalkeeper: -1 },
      });
      const errors = await validate(dto);
      const slotErrors = errors.filter((e) => e.property === 'benchConfig');
      expect(slotErrors.length).toBeGreaterThan(0);
    });

    it('rejects zero playerIds (IsPositive)', async () => {
      const dto = toDto({
        benchConfig: { centerBack: 0 },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects non-integer playerIds', async () => {
      const dto = toDto({
        benchConfig: { forward: 3.7 },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects string playerIds that are not pure integers', async () => {
      // 'transform: true' will try to coerce; non-numeric strings
      // either stay as NaN (rejected by IsInt) or fail IsPositive.
      const dto = toDto({
        benchConfig: { winger: 'banana' as unknown as number },
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('regression — previous naked-any bypass is closed', () => {
    it('the DTO has exactly 6 declared slot keys, no more', () => {
      // The "whitelist" defence lives in the global `ValidationPipe`
      // (`main.ts:115` runs with `whitelist: true`); here we just
      // pin the DTO's declared surface. If a future refactor adds
      // a 7th field without updating the engine's `BenchConfig`
      // interface + `POSITION_TO_BENCH_KEY` map, this test forces
      // the reviewer to think about whether the schema drift is
      // intentional.
      const body = new BenchConfigBodyDto();
      const declared = Object.keys(body);
      expect(declared.sort()).toEqual(
        [
          'centralMidfield',
          'centerBack',
          'forward',
          'fullback',
          'goalkeeper',
          'winger',
        ].sort(),
      );
    });
  });

  describe('BenchConfigBodyDto — empty object is valid (no slots set yet)', () => {
    it('accepts an empty benchConfig object', async () => {
      const dto = toDto({ benchConfig: {} });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});

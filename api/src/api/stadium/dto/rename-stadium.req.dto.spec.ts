import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RenameStadiumReqDto } from './rename-stadium.req.dto';

describe('RenameStadiumReqDto — §5.3 重命名', () => {
    const toDto = (data: Record<string, unknown>) =>
        plainToInstance(RenameStadiumReqDto, data);

    it('should accept a valid name', async () => {
        const dto = toDto({ name: 'Old Trafford' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
    });

    it('should reject empty name', async () => {
        const dto = toDto({ name: '' });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject name longer than 128 chars', async () => {
        const dto = toDto({ name: 'A'.repeat(129) });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
    });
});

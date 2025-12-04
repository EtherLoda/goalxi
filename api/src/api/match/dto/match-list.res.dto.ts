import { MatchResDto } from './match.res.dto';

export class MatchListResDto {
    data!: MatchResDto[];
    meta!: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

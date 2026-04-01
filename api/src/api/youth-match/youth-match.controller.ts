import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { YouthMatchService } from './youth-match.service';
import { ListYouthMatchesReqDto } from './dto/list-youth-matches.req.dto';
import { YouthMatchResDto, YouthMatchListResDto } from './dto/youth-match.res.dto';
import { SubmitYouthTacticsReqDto } from './dto/submit-youth-tactics.req.dto';
import { YouthTacticsResDto } from './dto/youth-tactics.res.dto';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { JwtPayloadType } from '@/api/auth/types/jwt-payload.type';
import { AuthGuard } from '@/guards/auth.guard';

import { Public } from '@/decorators/public.decorator';

@Controller({
    path: 'youth-matches',
    version: '1',
})
@UseGuards(AuthGuard)
export class YouthMatchController {
    constructor(private readonly youthMatchService: YouthMatchService) {}

    // ==================== Match Endpoints ====================

    @Public()
    @Get()
    async listMatches(
        @Query() filters: ListYouthMatchesReqDto,
    ): Promise<YouthMatchListResDto> {
        return this.youthMatchService.findAll(filters);
    }

    @Public()
    @Get(':id')
    async getMatch(@Param('id') id: string): Promise<YouthMatchResDto> {
        return this.youthMatchService.findOne(id);
    }

    @Public()
    @Get(':matchId/events')
    async getMatchEvents(
        @Param('matchId') matchId: string,
        @CurrentUser() user?: JwtPayloadType,
    ): Promise<any[]> {
        return this.youthMatchService.getMatchEvents(matchId, user?.id);
    }

    // ==================== Tactics Endpoints ====================

    @Public()
    @Get(':matchId/tactics')
    async getTactics(
        @Param('matchId') matchId: string,
        @CurrentUser() user?: JwtPayloadType,
    ): Promise<{ homeTactics: YouthTacticsResDto | null; awayTactics: YouthTacticsResDto | null }> {
        return this.youthMatchService.getTactics(matchId, user?.id);
    }

    @Public()
    @Post(':matchId/tactics')
    async submitTactics(
        @Param('matchId') matchId: string,
        @Body() dto: SubmitYouthTacticsReqDto,
        @CurrentUser() user?: JwtPayloadType,
    ): Promise<YouthTacticsResDto> {
        // TODO: Re-enable ownership validation for production
        // await this.youthMatchService.validateYouthTeamOwnership(user?.id, dto.youthTeamId);
        return this.youthMatchService.submitTactics(matchId, dto.youthTeamId, dto);
    }

    @Public()
    @Put(':matchId/tactics')
    async updateTactics(
        @Param('matchId') matchId: string,
        @Body() dto: SubmitYouthTacticsReqDto,
        @CurrentUser() user?: JwtPayloadType,
    ): Promise<YouthTacticsResDto> {
        // TODO: Re-enable ownership validation for production
        // await this.youthMatchService.validateYouthTeamOwnership(user?.id, dto.youthTeamId);
        return this.youthMatchService.submitTactics(matchId, dto.youthTeamId, dto);
    }
}

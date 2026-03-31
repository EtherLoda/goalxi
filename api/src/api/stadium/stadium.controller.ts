import { Uuid } from '@/common/types/common.type';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StadiumService } from './stadium.service';
import { BuildStadiumReqDto, ResizeStadiumReqDto } from './dto/stadium.req.dto';
import { Public } from '@/decorators/public.decorator';

@ApiTags('Stadium')
@Controller({
    path: 'teams/:teamId/stadium',
    version: '1',
})
export class StadiumController {
    constructor(private readonly stadiumService: StadiumService) {}

    @Public()
    @Get()
    @HttpCode(HttpStatus.OK)
    async getStadium(@Param('teamId') teamId: Uuid) {
        return this.stadiumService.getByTeamId(teamId);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async buildStadium(
        @Param('teamId') teamId: Uuid,
        @Body() dto: BuildStadiumReqDto,
    ) {
        return this.stadiumService.build(teamId, dto);
    }

    @Put()
    @HttpCode(HttpStatus.OK)
    async resizeStadium(
        @Param('teamId') teamId: Uuid,
        @Body() dto: ResizeStadiumReqDto,
    ) {
        return this.stadiumService.resize(teamId, dto);
    }

    @Delete()
    @HttpCode(HttpStatus.OK)
    async demolishStadium(@Param('teamId') teamId: Uuid) {
        return this.stadiumService.demolish(teamId);
    }
}

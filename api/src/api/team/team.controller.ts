import { Uuid } from '@/common/types/common.type';
import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateTeamReqDto } from './dto/create-team.req.dto';
import { ListTeamReqDto } from './dto/list-team.req.dto';
import { TeamResDto } from './dto/team.res.dto';
import { UpdateTeamReqDto } from './dto/update-team.req.dto';
import { TeamService } from './team.service';

import { Public } from '@/decorators/public.decorator';

@ApiTags('Team')
@Controller({
    path: 'teams',
    version: '1',
})
export class TeamController {
    constructor(private readonly teamService: TeamService) { }

    @Public()
    @Get()
    @HttpCode(HttpStatus.OK)
    async findMany(@Query() query: ListTeamReqDto) {
        return this.teamService.findMany(query);
    }

    @Public()
    @Get(':id')
    @HttpCode(HttpStatus.OK)
    async findOne(@Param('id') id: Uuid): Promise<TeamResDto> {
        return this.teamService.findOne(id);
    }

    @Get('user/:userId')
    @HttpCode(HttpStatus.OK)
    async findByUserId(@Param('userId') userId: Uuid): Promise<TeamResDto | null> {
        return this.teamService.findByUserId(userId);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() dto: CreateTeamReqDto): Promise<TeamResDto> {
        return this.teamService.create(dto);
    }

    @Patch(':id')
    @HttpCode(HttpStatus.OK)
    async update(
        @Param('id') id: Uuid,
        @Body() dto: UpdateTeamReqDto,
    ): Promise<TeamResDto> {
        return this.teamService.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async delete(@Param('id') id: Uuid): Promise<void> {
        return this.teamService.delete(id);
    }
}

import { Uuid } from '@/common/types/common.type';
import { Public } from '@/decorators/public.decorator';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CupService } from './cup.service';
import { CupBracketResDto } from './dto/cup-bracket.res.dto';
import { CupResDto } from './dto/cup.res.dto';
import { ListCupReqDto } from './dto/list-cup.req.dto';

@ApiTags('Cup')
@Controller({
  path: 'cups',
  version: '1',
})
export class CupController {
  constructor(private readonly cupService: CupService) {}

  /**
   * List cups. `season` and `type` are both optional;
   * omitting both returns every cup (the MVP has at most
   * one cup per season, so this is rarely interesting).
   *
   * Public — the cup is a public artifact; no auth
   * required to read the bracket.
   */
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async findMany(@Query() query: ListCupReqDto): Promise<CupResDto[]> {
    return this.cupService.findMany(query);
  }

  @Public()
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: Uuid): Promise<CupResDto> {
    return this.cupService.findOne(id);
  }

  /**
   * Full bracket — cup meta + every round + every match.
   * This is the heaviest endpoint; the L1-L4 MVP returns
   * ~2000 match rows. The FE should cache this per cup
   * (the bracket doesn't change between rounds except for
   * the active round's match status).
   */
  @Public()
  @Get(':id/bracket')
  @HttpCode(HttpStatus.OK)
  async findBracket(@Param('id') id: Uuid): Promise<CupBracketResDto> {
    return this.cupService.findBracket(id);
  }

  /**
   * Just one round's matches — for "live round" views that
   * poll every few seconds. The FE can fetch the full
   * bracket once at page load and then poll this per round.
   */
  @Public()
  @Get(':id/rounds/:round/matches')
  @HttpCode(HttpStatus.OK)
  async findRoundMatches(
    @Param('id') id: Uuid,
    @Param('round', ParseIntPipe) round: number,
  ): Promise<CupBracketResDto> {
    const bracket = await this.cupService.findBracket(id);
    return {
      cup: bracket.cup,
      rounds: bracket.rounds.filter((r) => r.roundNumber === round),
    };
  }
}

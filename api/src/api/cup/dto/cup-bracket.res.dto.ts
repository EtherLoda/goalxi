import { Expose, Type } from 'class-transformer';
import { CupRoundResDto } from './cup-round.res.dto';
import { CupResDto } from './cup.res.dto';

/**
 * Full cup bracket — the response shape for
 * `GET /cups/:id/bracket`. Bundles the cup summary + every
 * round's matches so the FE can render the whole tree in
 * one fetch.
 */
export class CupBracketResDto {
  @Expose()
  @Type(() => CupResDto)
  cup: CupResDto;

  @Expose()
  @Type(() => CupRoundResDto)
  rounds: CupRoundResDto[];
}

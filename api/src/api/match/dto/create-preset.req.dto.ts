import { GAME_SETTINGS, TeamTacticCode } from '@goalxi/database';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DefensiveLine, PitchWidth, Tempo } from '../types/tactical-dimensions';
import { SubstitutionDto } from './substitution.dto';

export class CreatePresetReqDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  formation!: string;

  // Player ids are int (post-PlayerIdToNumeric migration). See
  // SubmitTacticsReqDto for the rationale.
  @IsObject()
  lineup!: Record<string, number>;

  @IsObject()
  @IsOptional()
  instructions?: Record<string, any>;

  // Same cap as `SubmitTacticsReqDto` — a preset that queued 4 voluntary
  // substitutions could otherwise be applied to a match, where the engine
  // would silently drop the 4th.
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(GAME_SETTINGS.MATCH_MAX_SUBSTITUTIONS, {
    message: `substitutions must not contain more than ${GAME_SETTINGS.MATCH_MAX_SUBSTITUTIONS} entries (only voluntary substitutions count; injury replacements are handled by the engine)`,
  })
  @ValidateNested({ each: true })
  @Type(() => SubstitutionDto)
  substitutions?: SubstitutionDto[];

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  // The four tactical parameters. A preset is a complete tactical snapshot,
  // so these are stored on the preset and copied onto the match row when the
  // request names this preset — see `MatchService.submitTactics`.
  //
  // All four are optional on the wire; the service fills the gaps with the
  // same defaults `match_tactics` uses ('balanced' / 'balanced' / 'mid' and
  // no team tactic), so a client that only knows about lineups still works.
  @IsEnum(Tempo)
  @IsOptional()
  tempo?: Tempo;

  @IsEnum(PitchWidth)
  @IsOptional()
  pitchWidth?: PitchWidth;

  @IsEnum(DefensiveLine)
  @IsOptional()
  defensiveLine?: DefensiveLine;

  // `null` is a real value here (no team tactic), not "leave unchanged" —
  // `@IsOptional()` accepts both `undefined` and `null`, and the service
  // stores `null` verbatim.
  @IsEnum(TeamTacticCode)
  @IsOptional()
  teamTactic?: TeamTacticCode | null;
}

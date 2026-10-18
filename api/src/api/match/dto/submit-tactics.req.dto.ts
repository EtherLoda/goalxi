import { GAME_SETTINGS, TeamTacticCode } from '@goalxi/database';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { DefensiveLine, PitchWidth } from '../types/tactical-dimensions';
import { SubstitutionDto } from './substitution.dto';

export class SubmitTacticsReqDto {
  @IsString()
  formation!: string;

  // Player ids are int (post-PlayerIdToNumeric migration). The wire payload
  // is `Record<slot, int playerId>`; we keep `IsObject()` only and let the
  // values stay as their native JSON type rather than enforcing string here.
  @IsObject()
  lineup!: Record<string, number>;

  @IsObject()
  @IsOptional()
  instructions?: Record<string, any>;

  // Cap the queued voluntary substitutions. `MATCH_MAX_SUBSTITUTIONS` is the
  // single source of truth (also enforced by the engine, which is the
  // backstop for tactics rows stored before this limit existed). Injury
  // replacements are made by the engine and do not count against the cap.
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(GAME_SETTINGS.MATCH_MAX_SUBSTITUTIONS, {
    message: `substitutions must not contain more than ${GAME_SETTINGS.MATCH_MAX_SUBSTITUTIONS} entries (only voluntary substitutions count; injury replacements are handled by the engine)`,
  })
  @ValidateNested({ each: true })
  @Type(() => SubstitutionDto)
  substitutions?: SubstitutionDto[];

  @IsUUID()
  @IsOptional()
  presetId?: string;

  @IsUUID()
  teamId!: string;

  @IsEnum(PitchWidth)
  @IsOptional()
  pitchWidth?: PitchWidth;

  @IsEnum(DefensiveLine)
  @IsOptional()
  defensiveLine?: DefensiveLine;

  // Team tactic — a separate layer from the two dimensions above. `null`
  // (or omitting the field) means "no team tactic", which is the neutral
  // engine behaviour. `@IsOptional()` skips validation for both `undefined`
  // and `null`, so an explicit `null` clears a previously chosen tactic.
  //
  // Whether the submitted lineup actually satisfies the tactic's 4-slot
  // requirement is NOT checkable here (it depends on the lineup payload), so
  // the gate lives in `MatchService.submitTactics` right after lineup
  // validation.
  @IsEnum(TeamTacticCode)
  @IsOptional()
  teamTactic?: TeamTacticCode | null;
}

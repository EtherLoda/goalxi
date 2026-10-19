import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsKnownPositionSlot } from '../../../decorators/is-known-position-slot.decorator';
import { EventCondition } from '../types/tactical-dimensions';

/**
 * Upper bound on queued position moves.
 *
 * Moves are free — they do not consume the three voluntary substitution
 * slots — so nothing about the *game* caps them. This cap exists for the
 * processor: `MatchEngine.applyInstructionsForTeam` scans the instruction
 * list at every unlock point, and an unbounded array from a hand-crafted
 * request would buy a large constant factor for nothing. Two moves per
 * pitch slot is far more than any real plan (one initial shuffle plus a
 * second adjustment after a red card).
 */
export const MAX_POSITION_MOVES = 24;

/**
 * "At minute N, put player P at slot S — but only if condition C holds."
 *
 * A move is the free sibling of a substitution: it changes where an
 * existing on-pitch player stands, so it never touches the bench and
 * never spends one of `MATCH_MAX_SUBSTITUTIONS`. The engine applies it
 * at the first key moment at or after `minute` where `condition` is
 * satisfied, or at minute 90 if the condition never comes true.
 */
export class MoveInstructionDto {
  @IsInt()
  @Min(1)
  @Max(120)
  minute!: number;

  // Player ids are int (post-PlayerIdToNumeric migration).
  @IsInt()
  @Min(1)
  player!: number;

  // Target slot. Validated against the shared position-family table so a
  // typo (`CBX`) is a 422 here rather than a silent no-op in the engine,
  // which would fold an unknown slot to "no position" and contribute
  // nothing to any lane.
  @IsString()
  @IsKnownPositionSlot()
  position!: string;

  // Same trigger vocabulary as `SubstitutionDto.condition`. Omitted means
  // "no condition" — apply at `minute`.
  @IsEnum(EventCondition)
  @IsOptional()
  condition?: EventCondition;
}

/**
 * The `instructions` payload. Today it carries exactly one collection;
 * keeping the object shape (rather than accepting a bare array) is what
 * lets `substitutions` and `moves` stay separate lists at the storage
 * layer — they have different on-pitch semantics and different budget
 * accounting.
 */
export class InstructionsDto {
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(MAX_POSITION_MOVES, {
    message: `instructions.moves must not contain more than ${MAX_POSITION_MOVES} entries`,
  })
  @ValidateNested({ each: true })
  @Type(() => MoveInstructionDto)
  moves?: MoveInstructionDto[];
}

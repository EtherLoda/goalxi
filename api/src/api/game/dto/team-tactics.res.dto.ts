import { PositionFamily, TeamTacticCode } from '@goalxi/database';

/**
 * One "N slots from this set of position families" clause of a tactic's
 * deployment requirement.
 *
 * `families` is a union: a slot counts if the player standing there belongs
 * to ANY family in the list. The same slot can never satisfy two clauses of
 * the same tactic — see `checkTacticRequirement`.
 */
export class TacticSlotRequirementResDto {
  families!: PositionFamily[];
  count!: number;
}

export class TeamTacticResDto {
  code!: TeamTacticCode;
  /**
   * Always non-empty. The sum of `count` across the clauses is the number of
   * outfield slots the tactic constrains; the remaining players are free.
   */
  requirements!: TacticSlotRequirementResDto[];
}

export class TeamTacticsResDto {
  tactics!: TeamTacticResDto[];
}

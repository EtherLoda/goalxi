import {
  BENCH_KEYS,
  POSITION_KEYS,
} from '@goalxi/database';

/**
 * Legacy slot keys the engine's `SLOT_KEY_NORMALIZER` accepts.
 *
 * The web client still emits some of these (the `PositionKey` FE
 * union has not yet been updated to the new 25-slot canonical set;
 * see commit 3 of the position-key unification plan). Until then,
 * the BE validator must accept the legacy keys at the wire
 * boundary and rely on the engine's own normalizer to fold them
 * into the canonical form before the engine consumes them.
 */
const LEGACY_SLOT_KEYS = [
  'ST',
  'CD', 'CDL', 'CDR',
  'CAM', 'CAML', 'CAMR',
  'CDM', 'DMF', 'DMFL', 'DMFR',
  'WBL', 'WBR',
  'LM1', 'LM2', 'RM1', 'RM2',
  'LW1', 'LW2', 'RW1', 'RW2',
  'LB1', 'RB1', 'DM1', 'DM2', 'DM3',
  'CF_LW', 'CF_RW',
] as const;

export class LineupValidator {
  // Accepts every slot the engine recognises as canonical (25 pitch
  // + 6 bench from `position-keys.constants.ts`) PLUS the legacy
  // alias family the FE client still emits. Adding a new slot key
  // to the constants tuple automatically widens this validator's
  // accepted set.
  private static readonly VALID_SLOTS: readonly string[] = [
    ...POSITION_KEYS,
    ...BENCH_KEYS,
    ...LEGACY_SLOT_KEYS,
  ];

  private static readonly BENCH_SLOTS: readonly string[] = [...BENCH_KEYS];

  static validate(
    lineup: Record<string, string | number>,
    teamPlayers: Array<string | number>,
    playerRoles?: Map<string, boolean>, // Map of playerId -> isGoalkeeper
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Normalize every player reference to its string form so that the
    // membership / role lookups below compare like-for-like regardless of
    // whether the caller passed ints (post-PlayerIdToNumeric migration) or
    // strings (legacy / DTO-stringified payloads). Without this we used to
    // compare `number[]` against `string[]` in `Array.includes`, which always
    // returned false and rejected every valid lineup as "Some players do
    // not belong to the team".
    const normalize = (
      id: string | number | null | undefined,
    ): string | null => (id == null ? null : String(id));

    // Separate bench slots from pitch slots
    const slots = Object.keys(lineup);
    const pitchSlots = slots.filter((s) => !this.BENCH_SLOTS.includes(s));
    const benchSlots = slots.filter((s) => this.BENCH_SLOTS.includes(s));
    const playerIds = Object.values(lineup)
      .map(normalize)
      .filter((id): id is string => id !== null);
    const pitchPlayerIds = playerIds.filter(
      (_, i) => !this.BENCH_SLOTS.includes(slots[i]),
    );

    const teamPlayerSet = new Set(teamPlayers.map((id) => String(id)));

    // Must have 9-11 players on pitch (bench not counted)
    if (pitchSlots.length < 9 || pitchSlots.length > 11) {
      errors.push('Lineup must have between 9 and 11 players');
    }

    // Must have GK on pitch
    const gkId = normalize(lineup.GK);
    if (!gkId) {
      errors.push('Lineup must include a goalkeeper (GK slot)');
    }

    // Validate that GK slot has a goalkeeper player
    if (gkId && playerRoles) {
      const isGK = playerRoles.get(gkId);
      if (isGK === false) {
        errors.push('Only a goalkeeper can be assigned to the GK position');
      }
    }

    // Validate that goalkeepers are only in GK position (bench slots excluded)
    if (playerRoles) {
      for (const [slot, rawPlayerId] of Object.entries(lineup)) {
        if (slot === 'GK' || !rawPlayerId) continue;
        if (this.BENCH_SLOTS.includes(slot)) continue;
        const isGK = playerRoles.get(String(rawPlayerId));
        if (isGK === true) {
          errors.push('Goalkeepers can only be assigned to the GK position');
          break; // Only report once
        }
      }
    }

    // Validate bench GK slot
    const benchGkId = normalize(lineup.BENCH_GK);
    if (benchGkId && playerRoles) {
      const isGK = playerRoles.get(benchGkId);
      if (isGK === false) {
        errors.push('Only goalkeepers can be assigned to BENCH_GK');
      }
    }

    // Validate that goalkeepers are not in non-GK bench slots
    if (playerRoles) {
      for (const [slot, rawPlayerId] of Object.entries(lineup)) {
        if (!slot.startsWith('BENCH_')) continue;
        if (slot === 'BENCH_GK' || !rawPlayerId) continue;
        const isGK = playerRoles.get(String(rawPlayerId));
        if (isGK === true) {
          errors.push('Goalkeepers can only be assigned to BENCH_GK');
          break;
        }
      }
    }

    // All slots must be valid
    const invalidSlots = slots.filter((s) => !this.VALID_SLOTS.includes(s));
    if (invalidSlots.length > 0) {
      errors.push(`Invalid slots: ${invalidSlots.join(', ')}`);
    }

    // No duplicate players on pitch (bench slots can have same player)
    if (new Set(pitchPlayerIds).size !== pitchPlayerIds.length) {
      errors.push('Lineup contains duplicate players');
    }

    // All players must belong to team
    const invalidPlayers = playerIds.filter((id) => !teamPlayerSet.has(id));
    if (invalidPlayers.length > 0) {
      errors.push('Some players do not belong to the team');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static getValidSlots(): string[] {
    return [...this.VALID_SLOTS];
  }
}

export class LineupValidator {
    private static readonly VALID_SLOTS = [
        // Goalkeeper (1)
        'GK',
        // Defense (7)
        'CB1', 'CB2', 'CB3', 'LB', 'RB', 'LWB', 'RWB',
        // Midfield (11)
        'DMF1', 'DMF2', 'DMF3',
        'CM1', 'CM2', 'CM3',
        'CAM1', 'CAM2', 'CAM3',
        'LM', 'RM',
        // Attack (5)
        'LW', 'RW', 'CFL', 'CF', 'CFR',
        // Bench slots (6)
        'BENCH_GK', 'BENCH_CB', 'BENCH_FB', 'BENCH_W', 'BENCH_CM', 'BENCH_FW',
    ];

    private static readonly BENCH_SLOTS = [
        'BENCH_GK', 'BENCH_CB', 'BENCH_FB', 'BENCH_W', 'BENCH_CM', 'BENCH_FW',
    ];

    static validate(
        lineup: Record<string, string>,
        teamPlayers: string[],
        playerRoles?: Map<string, boolean>, // Map of playerId -> isGoalkeeper
    ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Separate bench slots from pitch slots
        const slots = Object.keys(lineup);
        const pitchSlots = slots.filter(s => !this.BENCH_SLOTS.includes(s));
        const benchSlots = slots.filter(s => this.BENCH_SLOTS.includes(s));
        const playerIds = Object.values(lineup);
        const pitchPlayerIds = playerIds.filter((_, i) => !this.BENCH_SLOTS.includes(slots[i]));

        // Must have 9-11 players on pitch (bench not counted)
        if (pitchSlots.length < 9 || pitchSlots.length > 11) {
            errors.push('Lineup must have between 9 and 11 players');
        }

        // Must have GK on pitch
        if (!lineup.GK) {
            errors.push('Lineup must include a goalkeeper (GK slot)');
        }

        // Validate that GK slot has a goalkeeper player
        if (lineup.GK && playerRoles) {
            const isGK = playerRoles.get(lineup.GK);
            if (isGK === false) {
                errors.push('Only a goalkeeper can be assigned to the GK position');
            }
        }

        // Validate that goalkeepers are only in GK position (bench slots excluded)
        if (playerRoles) {
            for (const [slot, playerId] of Object.entries(lineup)) {
                if (slot !== 'GK' && playerId && !this.BENCH_SLOTS.includes(slot)) {
                    const isGK = playerRoles.get(playerId);
                    if (isGK === true) {
                        errors.push('Goalkeepers can only be assigned to the GK position');
                        break; // Only report once
                    }
                }
            }
        }

        // Validate bench GK slot
        if (lineup.BENCH_GK && playerRoles) {
            const isGK = playerRoles.get(lineup.BENCH_GK);
            if (isGK === false) {
                errors.push('Only goalkeepers can be assigned to BENCH_GK');
            }
        }

        // Validate that goalkeepers are not in non-GK bench slots
        if (playerRoles) {
            for (const [slot, playerId] of Object.entries(lineup)) {
                if (slot.startsWith('BENCH_') && slot !== 'BENCH_GK' && playerId) {
                    const isGK = playerRoles.get(playerId);
                    if (isGK === true) {
                        errors.push('Goalkeepers can only be assigned to BENCH_GK');
                        break;
                    }
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
        const invalidPlayers = playerIds.filter((id) => !teamPlayers.includes(id));
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

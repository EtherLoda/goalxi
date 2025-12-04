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
        'LW', 'RW', 'ST1', 'ST2', 'ST3',
    ];

    static validate(
        lineup: Record<string, string>,
        teamPlayers: string[],
    ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const slots = Object.keys(lineup);
        const playerIds = Object.values(lineup);

        // Must have 9-11 players
        if (slots.length < 9 || slots.length > 11) {
            errors.push('Lineup must have between 9 and 11 players');
        }

        // Must have GK
        if (!lineup.GK) {
            errors.push('Lineup must include a goalkeeper (GK slot)');
        }

        // All slots must be valid
        const invalidSlots = slots.filter((s) => !this.VALID_SLOTS.includes(s));
        if (invalidSlots.length > 0) {
            errors.push(`Invalid slots: ${invalidSlots.join(', ')}`);
        }

        // No duplicate players
        if (new Set(playerIds).size !== playerIds.length) {
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

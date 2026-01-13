import { PlayerEntity } from '@goalxi/database';
import { Player, PlayerAttributes } from '../../types/player.types';

export class PlayerAdapter {
    static toSimulationPlayer(entity: PlayerEntity): Player {
        const skills = entity.currentSkills;
        if (!skills) {
            // Fallback for empty skills
            return this.createFallbackPlayer(entity);
        }

        const isGK = entity.isGoalkeeper;
        const phys = skills.physical;
        const ment = skills.mental;

        // Initialize with common attributes
        const attributes: PlayerAttributes = {
            pace: phys.pace || 0,
            strength: phys.strength || 0,
            positioning: ment.positioning || 0,
            composure: ment.composure || 0,
            // Set pieces
            freeKicks: skills.setPieces?.freeKicks || 10,
            penalties: skills.setPieces?.penalties || 10,
            // Default logical zeros
            finishing: 0,
            passing: 0,
            dribbling: 0,
            defending: 0
        };

        if (isGK) {
            // Cast technical to GK
            // We assume data integrity here or check keys
            const tech = skills.technical as any; // safe cast for hybrid structures
            attributes.gk_reflexes = tech.reflexes || 0;
            attributes.gk_handling = tech.handling || 0;
            attributes.gk_distribution = tech.distribution || 0;

            // GK also has basic technical stats usually 0 or low in DB? 
            // If the DB explicitly stores them as GKTechnical, they don't have finishing/etc.
        } else {
            const tech = skills.technical as any;
            attributes.finishing = tech.finishing || 0;
            attributes.passing = tech.passing || 0;
            attributes.dribbling = tech.dribbling || 0;
            attributes.defending = tech.defending || 0;
        }

        return {
            id: entity.id,
            name: entity.name,
            position: isGK ? 'GK' : 'ST', // Placeholder natural position
            attributes: attributes,
            currentStamina: entity.stamina || 3,
            form: entity.form || 5,
            experience: entity.experience || 10,
            overall: this.calculateOverall(entity.currentSkills),
            exactAge: entity.getExactAge(),
            appearance: entity.appearance
        };
    }

    private static createFallbackPlayer(entity: PlayerEntity): Player {
        return {
            id: entity.id,
            name: entity.name,
            position: 'Unknown',
            attributes: {
                pace: 10, strength: 10, finishing: 10, passing: 10,
                dribbling: 10, defending: 10, positioning: 10, composure: 10,
                freeKicks: 10, penalties: 10
            },
            currentStamina: 3,
            form: 5,
            experience: 0,
            overall: 50,
            exactAge: entity.birthday ? entity.getExactAge() : [0, 0],
            appearance: entity.appearance
        };
    }

    /**
     * Calculate overall rating from player skills
     * Same logic as API backend: average all skills * 5 (scales 0-20 range to 0-100)
     */
    private static calculateOverall(skills: any): number {
        if (!skills) return 50; // Default fallback

        let total = 0;
        let count = 0;

        // Iterate through all skill categories (physical, technical, mental)
        for (const category of Object.values(skills)) {
            if (category && typeof category === 'object') {
                for (const value of Object.values(category)) {
                    if (typeof value === 'number') {
                        total += value;
                        count++;
                    }
                }
            }
        }

        return count > 0 ? Math.round((total / count) * 5) : 50;
    }
}

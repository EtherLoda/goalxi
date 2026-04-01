/**
 * Simulation-specific player types.
 * Defines the flat attribute structure used by the match engine.
 * The mapping from PlayerEntity.currentSkills (nested JSONB) to this structure
 * is centralized here — if the DB schema changes, only this file needs updating.
 */

import { PlayerEntity } from '../entities/player.entity';
import { YouthPlayerEntity } from '../entities/youth-player.entity';

// Field path: how to access each attribute inside PlayerSkills JSONB
const FIELD_MAP = {
    pace: ['physical', 'pace'],
    strength: ['physical', 'strength'],
    positioning: ['mental', 'positioning'],
    composure: ['mental', 'composure'],
    freeKicks: ['setPieces', 'freeKicks'],
    penalties: ['setPieces', 'penalties'],
    finishing: ['technical', 'finishing'],
    passing: ['technical', 'passing'],
    dribbling: ['technical', 'dribbling'],
    defending: ['technical', 'defending'],
    // GK
    gk_reflexes: ['technical', 'reflexes'],
    gk_handling: ['technical', 'handling'],
    gk_distribution: ['technical', 'distribution'],
} as const;

function getIn(obj: any, path: readonly string[]): number {
    let cur = obj;
    for (const key of path) {
        if (cur == null) return 0;
        cur = cur[key];
    }
    return typeof cur === 'number' ? cur : 0;
}

function computeOverall(skills: any): number {
    let total = 0;
    let count = 0;
    for (const category of Object.values(skills ?? {})) {
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

export interface SimulationPlayerAttributes {
    pace: number;
    strength: number;
    positioning: number;
    composure: number;
    freeKicks: number;
    penalties: number;
    finishing: number;
    passing: number;
    dribbling: number;
    defending: number;
    gk_reflexes?: number;
    gk_handling?: number;
    gk_distribution?: number;
    abilities?: PlayerAbility[];
}

export type PlayerAbility =
    | 'header_specialist'
    | 'long_passer'
    | 'cross_specialist'
    | 'dribble_master'
    | 'long_shooter'
    | 'clutch_player'
    | 'tackle_master'
    | 'penalty_saver'
    | 'counter_starter'
    | 'rebound_specialist'
    | 'fast_start';

export interface SimulationPlayer {
    id: string;
    name: string;
    position: string;
    attributes: SimulationPlayerAttributes;
    currentStamina: number;
    form: number;
    experience: number;
    exactAge: [number, number];
    appearance?: Record<string, any>;
    overall?: number; // Snapshots use player.overall || 50
}

/**
 * Convert a PlayerEntity to the flat SimulationPlayer structure.
 * All field path mappings are defined in FIELD_MAP above — single source of truth.
 */
export function toSimulationPlayer(entity: PlayerEntity): SimulationPlayer {
    const skills = entity.currentSkills ?? {};

    const attributes: SimulationPlayerAttributes = {
        pace: getIn(skills, FIELD_MAP.pace),
        strength: getIn(skills, FIELD_MAP.strength),
        positioning: getIn(skills, FIELD_MAP.positioning),
        composure: getIn(skills, FIELD_MAP.composure),
        freeKicks: getIn(skills, FIELD_MAP.freeKicks),
        penalties: getIn(skills, FIELD_MAP.penalties),
        finishing: getIn(skills, FIELD_MAP.finishing),
        passing: getIn(skills, FIELD_MAP.passing),
        dribbling: getIn(skills, FIELD_MAP.dribbling),
        defending: getIn(skills, FIELD_MAP.defending),
    };

    if (entity.isGoalkeeper) {
        (attributes as any).gk_reflexes = getIn(skills, FIELD_MAP.gk_reflexes);
        (attributes as any).gk_handling = getIn(skills, FIELD_MAP.gk_handling);
        (attributes as any).gk_distribution = getIn(skills, FIELD_MAP.gk_distribution);
    }

    const rawAbilities = (skills as any)?.abilities;
    if (Array.isArray(rawAbilities)) {
        attributes.abilities = rawAbilities;
    }

    return {
        id: entity.id,
        name: entity.name,
        position: entity.isGoalkeeper ? 'GK' : 'ST',
        attributes,
        currentStamina: entity.stamina ?? 3,
        form: entity.form ?? 5,
        experience: entity.experience ?? 10,
        overall: computeOverall(skills),
        exactAge: entity.getExactAge(),
        appearance: entity.appearance,
    };
}

/**
 * Convert a YouthPlayerEntity to the flat SimulationPlayer structure.
 * Youth players use default values for stamina/form/experience.
 */
export function toSimulationYouthPlayer(entity: YouthPlayerEntity): SimulationPlayer {
    const skills = entity.currentSkills ?? {};

    const attributes: SimulationPlayerAttributes = {
        pace: getIn(skills, FIELD_MAP.pace),
        strength: getIn(skills, FIELD_MAP.strength),
        positioning: getIn(skills, FIELD_MAP.positioning),
        composure: getIn(skills, FIELD_MAP.composure),
        freeKicks: getIn(skills, FIELD_MAP.freeKicks),
        penalties: getIn(skills, FIELD_MAP.penalties),
        finishing: getIn(skills, FIELD_MAP.finishing),
        passing: getIn(skills, FIELD_MAP.passing),
        dribbling: getIn(skills, FIELD_MAP.dribbling),
        defending: getIn(skills, FIELD_MAP.defending),
    };

    if (entity.isGoalkeeper) {
        (attributes as any).gk_reflexes = getIn(skills, FIELD_MAP.gk_reflexes);
        (attributes as any).gk_handling = getIn(skills, FIELD_MAP.gk_handling);
        (attributes as any).gk_distribution = getIn(skills, FIELD_MAP.gk_distribution);
    }

    const rawAbilities = (skills as any)?.abilities;
    if (Array.isArray(rawAbilities)) {
        attributes.abilities = rawAbilities;
    }

    // Youth players use defaults for stamina/form/experience
    const exactAge = computeExactAge(entity.birthday);

    return {
        id: entity.id,
        name: entity.name,
        position: entity.isGoalkeeper ? 'GK' : 'ST',
        attributes,
        currentStamina: 3, // default
        form: 5, // default
        experience: 5, // default
        overall: computeOverall(skills),
        exactAge,
        appearance: undefined,
    };
}

function computeExactAge(birthday: Date): [number, number] {
    if (!birthday) return [0, 0];
    const birth = new Date(birthday);
    const now = new Date();
    const years = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    const dayDiff = now.getDate() - birth.getDate();
    let months = monthDiff;
    if (dayDiff < 0) months--;
    if (months < 0) months += 12;
    return [years, months];
}

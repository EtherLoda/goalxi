// Re-export simulation player types from shared database package.
// The mapping from PlayerEntity.currentSkills to SimulationPlayer is defined
// in @goalxi/database — single source of truth.
export {
    SimulationPlayerAttributes as PlayerAttributes,
    SimulationPlayer as Player,
} from '@goalxi/database';

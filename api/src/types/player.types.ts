export interface PlayerAttributes {
    // Physical (Shared)
    pace: number;
    strength: number;

    // Technical (Outfield)
    finishing: number;
    passing: number;
    dribbling: number;
    defending: number;

    // Mental (Shared)
    positioning: number;
    composure: number;

    // Goalkeeper Specific (Technical)
    gk_reflexes?: number;
    gk_handling?: number;
    gk_distribution?: number;
}


export interface Player {
    id: string;
    name: string;
    position: string; // "CF", "GK", etc.
    attributes: PlayerAttributes;
    currentStamina: number;
    form: number;
    experience: number;
    // ... other fields
}

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
    overall?: number; // Overall rating for performance calculation
    appearance?: any; // Player appearance data from database
    // ... other fields
}

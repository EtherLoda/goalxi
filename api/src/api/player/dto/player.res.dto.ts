import {
    BooleanField,
    DateField,
    NumberField,
    StringField,
    StringFieldOptional,
    UUIDField,
    UUIDFieldOptional,
} from '@/decorators/field.decorators';
import { PotentialTier, TrainingSlot, PlayerSkills } from '@goalxi/database';
import { Exclude, Expose, Transform } from 'class-transformer';

@Exclude()
export class PlayerResDto {
    @UUIDField()
    @Expose()
    id: string;

    @UUIDFieldOptional()
    @Expose()
    teamId?: string | null;

    @StringField()
    @Expose()
    name: string;

    @DateField({ nullable: true })
    @Expose()
    birthday?: Date;

    @BooleanField()
    @Expose()
    isYouth: boolean;

    @NumberField({ int: true })
    @Expose()
    age: number;

    @NumberField({ int: true })
    @Expose()
    ageDays: number;

    @Expose()
    appearance: Record<string, any>;



    @BooleanField()
    @Expose()
    isGoalkeeper: boolean;

    @StringFieldOptional()
    @Expose()
    position?: string;

    @NumberField({ int: true })
    @Expose()
    overall: number;

    @BooleanField()
    @Expose()
    onTransfer: boolean;

    @Expose()
    @Transform(({ value }) => {
        if (!value) return value;
        const floored: any = { physical: {}, technical: {}, mental: {} };

        // Floor all skill values to integers (hide decimals from users)
        for (const category of ['physical', 'technical', 'mental']) {
            if (value[category]) {
                floored[category] = {};
                for (const attr in value[category]) {
                    floored[category][attr] = Math.floor(value[category][attr]);
                }
            }
        }
        return floored;
    })
    currentSkills: PlayerSkills;

    @Expose()
    @Transform(({ value }) => {
        if (!value) return value;
        const floored: any = { physical: {}, technical: {}, mental: {} };

        // Floor all skill values to integers (hide decimals from users)
        for (const category of ['physical', 'technical', 'mental']) {
            if (value[category]) {
                floored[category] = {};
                for (const attr in value[category]) {
                    floored[category][attr] = Math.floor(value[category][attr]);
                }
            }
        }
        return floored;
    })
    potentialSkills: PlayerSkills;

    @NumberField({ int: true })
    @Expose()
    potentialAbility: number;

    @Expose()
    potentialTier: PotentialTier;

    @Expose()
    trainingSlot: TrainingSlot;

    @NumberField()
    @Expose()
    @Transform(({ value }) => Math.floor(value)) // Floor to integer (hide decimals from users)
    experience: number;

    @NumberField()
    @Expose()
    @Transform(({ value }) => Math.floor(value)) // Floor to integer (hide decimals from users)
    form: number;

    @NumberField()
    @Expose()
    @Transform(({ value }) => Math.floor(value)) // Floor to integer (hide decimals from users)
    stamina: number;

    @DateField()
    @Expose()
    createdAt: Date;

    @DateField()
    @Expose()
    updatedAt: Date;
}

import {
    BooleanField,
    DateField,
    StringField,
    StringFieldOptional,
    UUIDField,
} from '@/decorators/field.decorators';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class PlayerResDto {
    @UUIDField()
    @Expose()
    id: string;

    @StringField()
    @Expose()
    name: string;

    @DateField({ nullable: true })
    @Expose()
    birthday?: Date;

    @StringField()
    @Expose()
    avatar: string;

    @StringFieldOptional()
    @Expose()
    position?: string;

    @BooleanField()
    @Expose()
    isGoalkeeper: boolean;

    @BooleanField()
    @Expose()
    onTransfer: boolean;

    @Expose()
    attributes: Record<string, any>;

    @DateField()
    @Expose()
    createdAt: Date;

    @DateField()
    @Expose()
    updatedAt: Date;
}

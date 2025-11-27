import { BooleanFieldOptional, DateFieldOptional, StringField, StringFieldOptional } from '@/decorators/field.decorators';
import { IsObject, IsOptional } from 'class-validator';

export class CreatePlayerReqDto {
    @StringField()
    name!: string;

    @DateFieldOptional()
    birthday?: Date;

    @StringFieldOptional()
    avatar?: string;

    @StringFieldOptional()
    position?: string;

    @BooleanFieldOptional()
    isGoalkeeper?: boolean;

    @IsOptional()
    @IsObject()
    attributes?: Record<string, any>;
}

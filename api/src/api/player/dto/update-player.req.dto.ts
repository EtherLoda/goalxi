import { BooleanFieldOptional, DateFieldOptional, StringFieldOptional } from '@/decorators/field.decorators';
import { IsObject, IsOptional } from 'class-validator';

export class UpdatePlayerReqDto {
    @StringFieldOptional()
    name?: string;

    @DateFieldOptional()
    birthday?: Date;

    @StringFieldOptional()
    avatar?: string;

    @StringFieldOptional()
    position?: string;

    @BooleanFieldOptional()
    isGoalkeeper?: boolean;

    @BooleanFieldOptional()
    onTransfer?: boolean;

    @IsOptional()
    @IsObject()
    attributes?: Record<string, any>;
}

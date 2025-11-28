import {
    ClassField,
    EnumField,
    NumberField,
    StringFieldOptional,
} from '@/decorators/field.decorators';
import { Exclude, Expose } from 'class-transformer';
import { TransactionType } from '../finance.constants';

@Exclude()
export class TransactionResDto {
    @ClassField(() => String)
    @Expose()
    id: string;

    @NumberField()
    @Expose()
    season: number;

    @NumberField()
    @Expose()
    amount: number;

    @EnumField(() => TransactionType)
    @Expose()
    type: TransactionType;

    @StringFieldOptional()
    @Expose()
    description?: string;

    @ClassField(() => Date)
    @Expose()
    createdAt: Date;
}

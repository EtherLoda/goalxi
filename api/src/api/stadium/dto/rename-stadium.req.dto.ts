import { StringField } from '@/decorators/field.decorators';

export class RenameStadiumReqDto {
    @StringField({ minLength: 1, maxLength: 128 })
    name!: string;
}

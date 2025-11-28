import {
    ClassField,
    EnumField,
    NumberField,
    UUIDField,
} from '@/decorators/field.decorators';
import { Exclude, Expose } from 'class-transformer';
import { TransferStatus } from '../entities/transfer.entity';
import { PlayerResDto } from '@/api/player/dto/player.res.dto';
import { TeamResDto } from '@/api/team/dto/team.res.dto';

@Exclude()
export class TransferResDto {
    @UUIDField()
    @Expose()
    id: string;

    @ClassField(() => PlayerResDto)
    @Expose()
    player: PlayerResDto;

    @ClassField(() => TeamResDto)
    @Expose()
    fromTeam: TeamResDto;

    @ClassField(() => TeamResDto)
    @Expose()
    toTeam?: TeamResDto;

    @NumberField()
    @Expose()
    price: number;

    @EnumField(() => TransferStatus)
    @Expose()
    status: TransferStatus;

    @ClassField(() => Date)
    @Expose()
    createdAt: Date;
}

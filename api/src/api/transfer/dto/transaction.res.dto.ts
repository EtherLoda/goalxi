import { PlayerResDto } from '@/api/player/dto/player.res.dto';
import { TeamResDto } from '@/api/team/dto/team.res.dto';
import {
  ClassField,
  EnumField,
  NumberField,
  UUIDField,
} from '@/decorators/field.decorators';
import {
  TransferTransactionStatus,
  TransferTransactionType,
} from '@goalxi/database';
import { Exclude, Expose, Transform } from 'class-transformer';

@Exclude()
export class TransactionResDto {
  @UUIDField()
  @Expose()
  id: string;

  @UUIDField()
  @Expose()
  auctionId: string;

  @ClassField(() => PlayerResDto)
  @Expose()
  player: PlayerResDto;

  @ClassField(() => TeamResDto)
  @Expose()
  fromTeam: TeamResDto;

  @ClassField(() => TeamResDto)
  @Expose()
  toTeam: TeamResDto;

  @NumberField()
  @Expose()
  amount: number;

  @EnumField(() => TransferTransactionType)
  @Expose()
  type: TransferTransactionType;

  @EnumField(() => TransferTransactionStatus)
  @Expose()
  status: TransferTransactionStatus;

  @Expose()
  @Transform(({ obj }) => {
    const date = obj.createdAt || obj.transactionDate;
    return date ? new Date(date).toISOString() : null;
  })
  transactionDate: Date | string;

  @Expose()
  @Transform(({ value }) => (value ? new Date(value).toISOString() : null))
  settledAt?: Date | string;

  @NumberField()
  @Expose()
  season: number;
}

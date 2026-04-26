import { TeamResDto } from '@/api/team/dto/team.res.dto';
import {
  ClassField,
  DateField,
  EnumField,
  NumberField,
  StringField,
  UUIDField,
} from '@/decorators/field.decorators';
import { Exclude, Expose } from 'class-transformer';

export enum LeagueNewsItemType {
  TRANSFER = 'TRANSFER',
  MATCH_RESULT = 'MATCH_RESULT',
  PRIZE_MONEY = 'PRIZE_MONEY',
  TRAINING_UPDATE = 'TRAINING_UPDATE',
}

@Exclude()
export class LeagueNewsItemDto {
  @UUIDField()
  @Expose()
  id: string;

  @EnumField(() => LeagueNewsItemType)
  @Expose()
  type: LeagueNewsItemType;

  @DateField()
  @Expose()
  date: Date;

  @StringField()
  @Expose()
  title: string;

  @StringField()
  @Expose()
  description: string;

  @NumberField()
  @Expose()
  season: number;

  @NumberField()
  @Expose()
  week: number;

  // Transfer specific
  @UUIDField()
  @Expose()
  playerId?: string;

  @StringField()
  @Expose()
  playerName?: string;

  @ClassField(() => TeamResDto)
  @Expose()
  fromTeam?: TeamResDto;

  @ClassField(() => TeamResDto)
  @Expose()
  toTeam?: TeamResDto;

  @NumberField()
  @Expose()
  amount?: number;

  // Match specific
  @UUIDField()
  @Expose()
  matchId?: string;

  @ClassField(() => TeamResDto)
  @Expose()
  homeTeam?: TeamResDto;

  @ClassField(() => TeamResDto)
  @Expose()
  awayTeam?: TeamResDto;

  @NumberField()
  @Expose()
  homeScore?: number;

  @NumberField()
  @Expose()
  awayScore?: number;

  // Prize specific
  @NumberField()
  @Expose()
  prizeAmount?: number;

  @NumberField()
  @Expose()
  position?: number;
}

export class LeagueNewsResDto {
  @ClassField(() => LeagueNewsItemDto)
  items: LeagueNewsItemDto[];

  @NumberField()
  total: number;
}

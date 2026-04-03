import { Expose } from 'class-transformer';

export class LeagueResDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  tier: number;

  @Expose()
  tierDivision: number;

  @Expose()
  maxTeams: number;

  @Expose()
  promotionSlots: number;

  @Expose()
  playoffSlots: number;

  @Expose()
  relegationSlots: number;

  @Expose()
  status: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

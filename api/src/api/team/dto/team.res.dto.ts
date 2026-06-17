import { BenchConfig } from '@goalxi/database';
import { Expose, Type } from 'class-transformer';

export class TeamResDto {
  @Expose()
  id: string;

  @Expose()
  userId: string;

  @Expose()
  leagueId: string | null;

  @Expose()
  name: string;

  @Expose()
  nationality?: string;

  @Expose()
  logoUrl: string;

  @Expose()
  jerseyColorPrimary: string;

  @Expose()
  jerseyColorSecondary: string;

  @Expose()
  jerseyColorTertiary: string;

  @Expose()
  foundedYear: number | null;

  @Expose()
  city: string | null;

  @Expose()
  bio: string | null;

  @Expose()
  benchConfig: BenchConfig | null;

  @Expose()
  staminaTrainingIntensity: number;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}

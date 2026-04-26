import { BenchConfig } from '@goalxi/database';
import { Expose } from 'class-transformer';

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
  benchConfig: BenchConfig | null;

  @Expose()
  staminaTrainingIntensity: number;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

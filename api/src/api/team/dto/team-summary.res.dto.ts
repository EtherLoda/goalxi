import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

/**
 * Public club summary — the club page's entire data contract.
 *
 * Deliberately NOT `TeamResDto`. That DTO is the owner's view of the
 * entity and carries `userId`, `benchConfig`, `staminaTrainingIntensity`
 * and `eloRating`; three of those are private planning state and one is
 * a hidden rating the game never shows (plan D9). A public page must
 * never be built on a shape that already leaks them.
 *
 * The manager block exposes the manager id because manager profiles are
 * public by design (plan D1/D2) — that is an identity, not a credential.
 */
export class TeamSummaryLeagueDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  tier: number;

  @Expose()
  @ApiProperty()
  tierDivision: number;
}

export class TeamSummaryManagerDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty({ nullable: true })
  name: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  avatarUrl: string | null;
}

export class TeamSummaryStadiumDto {
  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  capacity: number;
}

export class TeamSummaryFansDto {
  @Expose()
  @ApiProperty()
  totalFans: number;
}

export class TeamSummaryStandingDto {
  @Expose()
  @ApiProperty()
  season: number;

  @Expose()
  @ApiProperty()
  position: number;

  @Expose()
  @ApiProperty()
  played: number;

  @Expose()
  @ApiProperty()
  wins: number;

  @Expose()
  @ApiProperty()
  draws: number;

  @Expose()
  @ApiProperty()
  losses: number;

  @Expose()
  @ApiProperty()
  goalsFor: number;

  @Expose()
  @ApiProperty()
  goalsAgainst: number;

  @Expose()
  @ApiProperty()
  goalDifference: number;

  @Expose()
  @ApiProperty()
  points: number;
}

export class TeamSummaryMatchDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  opponentId: string;

  @Expose()
  @ApiProperty()
  opponentName: string;

  @Expose()
  @ApiProperty()
  isHome: boolean;

  @Expose()
  @ApiProperty()
  goalsFor: number;

  @Expose()
  @ApiProperty()
  goalsAgainst: number;

  @Expose()
  @ApiProperty({ enum: ['W', 'D', 'L'] })
  result: 'W' | 'D' | 'L';

  @Expose()
  @ApiProperty()
  scheduledAt: Date;
}

export class TeamSummaryResDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  shortCode: string;

  @Expose()
  @ApiProperty({ nullable: true })
  city: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  foundedYear: number | null;

  @Expose()
  @ApiProperty()
  logoUrl: string;

  @Expose()
  @ApiProperty()
  jerseyColorPrimary: string;

  @Expose()
  @ApiProperty()
  jerseyColorSecondary: string;

  @Expose()
  @ApiProperty()
  jerseyColorTertiary: string;

  @Expose()
  @ApiProperty({ type: TeamSummaryLeagueDto, nullable: true })
  @Type(() => TeamSummaryLeagueDto)
  league: TeamSummaryLeagueDto | null;

  @Expose()
  @ApiProperty({ type: TeamSummaryManagerDto, nullable: true })
  @Type(() => TeamSummaryManagerDto)
  manager: TeamSummaryManagerDto | null;

  @Expose()
  @ApiProperty({ type: TeamSummaryStadiumDto, nullable: true })
  @Type(() => TeamSummaryStadiumDto)
  stadium: TeamSummaryStadiumDto | null;

  @Expose()
  @ApiProperty({ type: TeamSummaryFansDto, nullable: true })
  @Type(() => TeamSummaryFansDto)
  fans: TeamSummaryFansDto | null;

  @Expose()
  @ApiProperty({ type: TeamSummaryStandingDto, nullable: true })
  @Type(() => TeamSummaryStandingDto)
  standing: TeamSummaryStandingDto | null;

  @Expose()
  @ApiProperty({ type: [TeamSummaryMatchDto] })
  @Type(() => TeamSummaryMatchDto)
  recentMatches: TeamSummaryMatchDto[];
}

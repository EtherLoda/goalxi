import {
  HexColorFieldOptional,
  NumberFieldOptional,
  StringFieldOptional,
  UUIDFieldOptional,
} from '@/decorators/field.decorators';

/**
 * PATCH body for `PATCH /teams/:id` and `PATCH /teams/me`.
 *
 * Identity-locked fields are deliberately absent from this DTO:
 *   - `nationality`, `city` — set at registration (claim / create)
 *     and never edited afterwards. The Settings page shows them as
 *     read-only.
 *   - `foundedYear` — auto-stamped to the year the team was
 *     created (the onboarding-claim year for manager-owned teams,
 *     the seed year for BOTs). Same lockdown.
 *
 * The global `ValidationPipe` runs with `whitelist: true`, so even
 * if a body smuggles these fields in they are silently dropped
 * before the service is called. The `TeamService.update` also
 * stops reading them — see the comment there for the defence-in-
 * depth rationale (a future code change that re-enables writes
 * would then have to remove BOTH the DTO field and the service
 * line to actually re-open the loophole).
 *
 * League assignment (`leagueId`) is also not editable here — it
 * is a server-side concern (seeding, scheduler, promotion/relegation)
 * and never exposed to managers. Kept in the DTO only because the
 * admin route used it historically; the FE never sends it.
 */
export class UpdateTeamReqDto {
  @StringFieldOptional({ minLength: 2, maxLength: 50 })
  name?: string;

  @UUIDFieldOptional()
  leagueId?: string;

  @StringFieldOptional()
  logoUrl?: string;

  @HexColorFieldOptional()
  jerseyColorPrimary?: string;

  @HexColorFieldOptional()
  jerseyColorSecondary?: string;

  @HexColorFieldOptional()
  jerseyColorTertiary?: string;

  @StringFieldOptional({ maxLength: 2000 })
  bio?: string;

  @NumberFieldOptional({ min: 0, max: 1 })
  staminaTrainingIntensity?: number;
}

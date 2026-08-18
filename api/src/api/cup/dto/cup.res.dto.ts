import { Expose } from 'class-transformer';

/**
 * Cup metadata returned by `GET /cups` and `GET /cups/:id`.
 *
 * This is the "summary" shape — the bracket is in
 * `CupBracketResDto`. The summary lets the FE render a cup
 * card / header without paying for the full bracket tree
 * (12 rounds × 2000+ slots for the L1-L4 MVP).
 */
export class CupResDto {
  @Expose()
  id: string;

  @Expose()
  season: number;

  @Expose()
  type: string;

  @Expose()
  name: string;

  @Expose()
  status: string;

  @Expose()
  prizeCurrency: string;

  /**
   * Serialized as a number (not bigint string) for FE display.
   * The DB column is `bigint` because prize pools can exceed
   * Number.MAX_SAFE_INTEGER in the long run; for the MVP we
   * assume amounts stay under 2^53. Round-trip conversion
   * happens in the service.
   */
  @Expose()
  prizePool: number;

  @Expose()
  createdAt: string;

  @Expose()
  updatedAt: string;
}

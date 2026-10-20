import {
  AuctionEntity,
  calculatePlayerPWI,
  PlayerEntity,
} from '@goalxi/database';
import { toAuctionResDto, toMyBidResDto } from './auction.mapper';

/**
 * Regression guard for the "综合 0" bug: the market page showed every
 * candidate with an overall of 0 because `AuctionResDto` nests the raw
 * `PlayerEntity`, and PWI is derived (there is no `overall` column), so
 * `plainToInstance(AuctionResDto, auction)` silently produced `undefined`.
 */
function makePlayer(): PlayerEntity {
  return {
    id: 'p1',
    name: 'Test Player',
    position: 'CF',
    isGoalkeeper: false,
    potentialAbility: 80,
    form: 3,
    currentSkills: {
      physical: { pace: 10, strength: 10 },
      technical: { finishing: 10, passing: 10, dribbling: 10, defending: 5 },
      mental: { positioning: 10, composure: 10 },
      setPieces: { freeKicks: 5, penalties: 5 },
    },
  } as unknown as PlayerEntity;
}

function makeAuction(overrides: Record<string, unknown> = {}): AuctionEntity {
  return {
    id: 'a1',
    player: makePlayer(),
    bidHistory: [],
    ...overrides,
  } as unknown as AuctionEntity;
}

describe('auction.mapper', () => {
  it('fills overall / pwi / pwiDisplay on the nested player', () => {
    const dto = toAuctionResDto(makeAuction());

    expect(dto.player.overall).toBeGreaterThan(0);
    expect(dto.player.overall).toBe(dto.player.pwi);
    expect(typeof dto.player.pwiDisplay).toBe('string');
    expect(dto.player.pwiDisplay.length).toBeGreaterThan(0);
  });

  it('reports the same PWI the players endpoint would', () => {
    const player = makePlayer();
    const dto = toAuctionResDto(makeAuction({ player }));

    // Same pure function the profile page's number comes from, so a
    // candidate and his profile can never disagree.
    expect(dto.player.overall).toBe(calculatePlayerPWI(player).pwi);
  });

  it('leaves a missing player untouched instead of throwing', () => {
    const dto = toAuctionResDto(makeAuction({ player: undefined }));
    expect(dto.player).toBeUndefined();
  });

  it('sets isLeading and isOutbid for my-bids', () => {
    const leading = toMyBidResDto(
      makeAuction({ currentBidderId: 'team-1' }),
      'team-1',
    );
    expect(leading.isLeading).toBe(true);
    expect(leading.isOutbid).toBe(false);

    const outbid = toMyBidResDto(
      makeAuction({
        currentBidderId: 'team-2',
        bidHistory: [{ teamId: 'team-1', amount: 100, timestamp: new Date() }],
      }),
      'team-1',
    );
    expect(outbid.isLeading).toBe(false);
    expect(outbid.isOutbid).toBe(true);
    expect(outbid.player.overall).toBeGreaterThan(0);
  });
});

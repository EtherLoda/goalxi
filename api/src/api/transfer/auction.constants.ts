export const AUCTION_CONFIG = {
  DEFAULT_DURATION_HOURS: parseInt(
    process.env.AUCTION_DURATION_HOURS || '1',
    10,
  ),
  EXTENSION_MINUTES: 3,
  EXTENSION_THRESHOLD_MINUTES: 3,
} as const;

/**
 * Minimum increment a new bid must add on top of the current
 * bid. We take the larger of:
 *   - a fixed 10 000 floor (small-auction sanity check)
 *   - 5% of the current bid (so expensive auctions don't get
 *     "sniped" by 10 000 jumps that would let a deeper-pocket
 *     team grind up the price by pennies)
 *
 * The caller adds the result to `currentBid` to get the
 * minimum acceptable next bid. (The previous version's comment
 * claimed this returned the *total* next bid — that was a
 * documentation bug; the function has always returned the
 * increment, and `placeBid` adds it to `currentBid`.)
 */
export function calculateMinBidIncrement(lastBid: number): number {
  const fixedIncrement = 10000;
  const percentIncrement = Math.ceil(lastBid * 0.05);
  return Math.max(fixedIncrement, percentIncrement);
}

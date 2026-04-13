export const AUCTION_CONFIG = {
  DEFAULT_DURATION_HOURS: parseInt(
    process.env.AUCTION_DURATION_HOURS || '1',
    10,
  ),
  MIN_BID_INCREMENT_FIXED: 10000, // Fixed minimum increment
  MIN_BID_INCREMENT_PERCENT: 0.02, // 2% of current price
  EXTENSION_MINUTES: 3,
  EXTENSION_THRESHOLD_MINUTES: 3,
} as const;

// Calculate minimum bid increment: max(lastBid + 10000, lastBid * 1.05)
export function calculateMinBidIncrement(lastBid: number): number {
  const fixedIncrement = 10000;
  const percentIncrement = Math.ceil(lastBid * 0.05);
  return Math.max(fixedIncrement, percentIncrement);
}

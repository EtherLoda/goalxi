export const AUCTION_CONFIG = {
  DEFAULT_DURATION_HOURS: 24,
  MIN_BID_INCREMENT_FIXED: 10000, // Fixed minimum increment
  MIN_BID_INCREMENT_PERCENT: 0.02, // 2% of current price
  EXTENSION_MINUTES: 3,
  EXTENSION_THRESHOLD_MINUTES: 3,
} as const;

// Calculate minimum bid increment: max(10000, currentPrice * 2%)
export function calculateMinBidIncrement(currentPrice: number): number {
  const percentIncrement = Math.ceil(
    currentPrice * AUCTION_CONFIG.MIN_BID_INCREMENT_PERCENT,
  );
  return Math.max(AUCTION_CONFIG.MIN_BID_INCREMENT_FIXED, percentIncrement);
}

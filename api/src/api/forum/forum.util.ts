/**
 * Compute a thread's hot score. Higher = more "hot".
 *
 * Formula balances engagement (replies, reactions) against time decay.
 * Score never goes negative — clamped at 0.
 */
export function computeHotScore(args: {
  replyCount: number;
  reactionCount: number;
  createdAt: Date;
  now?: Date;
}): number {
  const now = args.now ?? new Date();
  const ageHours =
    (now.getTime() - args.createdAt.getTime()) / (1000 * 60 * 60);
  const raw = args.replyCount * 2 + args.reactionCount - ageHours / 12;
  return Math.max(0, Math.round(raw * 100) / 100);
}

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

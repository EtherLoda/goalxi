/**
 * P2-#22: typed catalogue of every `messageKey` the API may emit.
 *
 * The API does NOT translate these — the client resolves the key
 * against its own i18n bundle (`web/messages/{en,zh,...}.json` under
 * the `notification.*` namespace). Keeping the union in the API
 * gives us:
 *   - autocomplete + typo-catch on the producer side (auction.service
 *     is the only caller today, but the controller is open for admin
 *     tooling);
 *   - a single, greppable source-of-truth for "which keys exist" so a
 *     future drift between the API and the web bundle is caught by
 *     `tsc` rather than by a confused player.
 *
 * When you add a new `NotificationType` value, add the matching key
 * here AND in the web bundle. When you delete a type, delete the key
 * from both.
 *
 * Format: `notification.<camelCase>` (matches the web convention; the
 * notification reducer on the web reads the segment after the dot).
 */
export type NotificationMessageKey =
  // Personal inbox — currently emitted
  | 'notification.auctionOutbid'

  // Personal inbox — reserved (see NotificationType comments).
  // NB: the `matchResult_*` keys are the exact strings the web
  // bundle ships (camelCase + underscore to disambiguate the
  // win/loss/draw variant — the renderer keys off the suffix).
  // Postfix-#1: an earlier version of this union had
  // `matchResultWin` etc. (camelCase) which did not match the
  // web bundle's `matchResult_win` and would have rendered as
  // raw fallback keys if a producer ever wired up the type.
  | 'notification.matchResult_win'
  | 'notification.matchResult_loss'
  | 'notification.matchResult_draw'
  | 'notification.playerSkillImproved'
  | 'notification.playerSkillDecreased'
  | 'notification.playerInjured'
  | 'notification.playerRecovered'
  | 'notification.playerPurchased'
  | 'notification.playerSold'
  | 'notification.auctionWon'
  | 'notification.auctionLost'
  | 'notification.leaguePositionChanged'
  | 'notification.seasonStarted'
  | 'notification.seasonEnded'
  | 'notification.teamInvitation'
  | 'notification.systemMessage'
  | 'notification.stadiumConstructionCompleted'

  // System / global — broad catch-all so the admin broadcast endpoint
  // can still accept custom keys without TS fighting the operator.
  // Use sparingly: any key here won't have a runtime translation in
  // the web bundle.
  | (string & {});

export const KNOWN_NOTIFICATION_MESSAGE_KEYS: readonly NotificationMessageKey[] = [
  'notification.auctionOutbid',
  'notification.matchResult_win',
  'notification.matchResult_loss',
  'notification.matchResult_draw',
  'notification.playerSkillImproved',
  'notification.playerSkillDecreased',
  'notification.playerInjured',
  'notification.playerRecovered',
  'notification.playerPurchased',
  'notification.playerSold',
  'notification.auctionWon',
  'notification.auctionLost',
  'notification.leaguePositionChanged',
  'notification.seasonStarted',
  'notification.seasonEnded',
  'notification.teamInvitation',
  'notification.systemMessage',
  'notification.stadiumConstructionCompleted',
] as const;

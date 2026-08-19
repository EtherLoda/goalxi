export enum QueueName {
  EMAIL = 'email',
  /**
   * `onboarding-assignment` — the team-claim queue consumed by
   * `settlement/src/processors/onboarding.processor.ts`. Produced
   * by `AuthService.register` (the register hot path) and by
   * `OnboardingService.enqueueAssignTeam` (the manual retry
   * endpoint `POST /onboarding/claim`).
   *
   * Uses a distinct queue name from the `email` queue so the
   * settlement worker can subscribe to ONLY the onboarding
   * stream — it does not need Redis credentials for the mail
   * delivery queue, and a noisy email backlog can't starve
   * team claims (or vice versa).
   */
  ONBOARDING = 'onboarding-assignment',
}

export enum QueuePrefix {
  AUTH = 'auth',
  /**
   * BullMQ writes keys to Redis as `<prefix>:<queue>:<jobId>`.
   * Using a dedicated prefix here (rather than `auth`) makes
   * the onboarding keys trivially greppable in
   * `redis-cli KEYS` and in the BullMQ dashboard, and keeps
   * them out of the `auth:` keyspace that holds session and
   * verification entries.
   */
  ONBOARDING = 'onboarding',
  /**
   * P1-#16: email delivery got promoted out of `auth` because it
   * is not an auth concern — it happens to *verify* an email, but
   * the same queue will eventually carry password reset,
   * match-result, season-start notifications, etc. Naming it after
   * the domain it serves (notification) rather than the first
   * caller (auth) keeps the keyspace honest.
   */
  NOTIFICATION = 'notification',
}

export enum JobName {
  EMAIL_VERIFICATION = 'email-verification',
  /**
   * Password-reset email. Shares the same `QueueName.EMAIL`
   * queue as verification (and future notification emails) so
   * the existing worker, rate limiter, and retry policy are
   * reused — see `email.processor.ts` for the switch.
   */
  EMAIL_PASSWORD_RESET = 'email-password-reset',
}

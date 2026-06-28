export enum ErrorCode {
  // Common Validation
  V000 = 'common.validation.error',

  // Validation
  V001 = 'user.validation.is_empty',
  V002 = 'user.validation.is_invalid',

  // Error
  E001 = 'user.error.username_or_email_exists',
  E002 = 'user.error.not_found',
  E003 = 'user.error.email_exists',

  // Forum
  F001 = 'forum.error.category_not_found',
  F002 = 'forum.error.thread_not_found',
  F003 = 'forum.error.post_not_found',
  F004 = 'forum.error.thread_locked',
  F005 = 'forum.error.not_thread_author',
  F006 = 'forum.error.title_too_short',
  F007 = 'forum.error.title_too_long',
  F008 = 'forum.error.body_too_short',
  F009 = 'forum.error.body_too_long',
  F010 = 'forum.error.invalid_slug',
}

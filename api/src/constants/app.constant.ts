export const IS_PUBLIC = 'isPublic';
export const IS_AUTH_OPTIONAL = 'isAuthOptional';

export enum Environment {
  LOCAL = 'local',
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
  TEST = 'test',
}

export enum LogService {
  CONSOLE = 'console',
  GOOGLE_LOGGING = 'google_logging',
  AWS_CLOUDWATCH = 'aws_cloudwatch',
}

export enum Order {
  ASC = 'ASC',
  DESC = 'DESC',
}

// Redact value of these paths from logs.
//
// Covers: auth headers, session cookies, common credential / recovery
// / 2FA fields, and PII that has no business being searchable in
// OpenObserve. Field names are listed in both camelCase (NestJS DTOs
// in this repo) and snake_case (third-party SDKs) where both show up
// in the codebase; `pino` matches paths exactly, so we have to list
// every spelling separately.
export const loggingRedactPaths = [
  // Auth headers / cookies
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  // Tokens & refresh tokens (multi-spelling)
  'req.body.token',
  'req.body.accessToken',
  'req.body.access_token',
  'req.body.refreshToken',
  'req.body.refresh_token',
  'req.body.idToken',
  'req.body.id_token',
  'req.body.resetToken',
  'req.body.reset_token',
  // Credentials & recovery codes
  'req.body.password',
  'req.body.oldPassword',
  'req.body.old_password',
  'req.body.newPassword',
  'req.body.new_password',
  'req.body.currentPassword',
  'req.body.current_password',
  'req.body.confirmPassword',
  'req.body.confirm_password',
  'req.body.twoFactorCode',
  'req.body.two_factor_code',
  'req.body.otp',
  'req.body.code',
  'req.body.verificationCode',
  'req.body.verification_code',
  'req.body.forgotToken',
  'req.body.forgot_token',
  // PII
  'req.body.email',
  'req.body.phone',
  'req.body.phoneNumber',
  'req.body.phone_number',
  'req.body.username',
];

export const DEFAULT_PAGE_LIMIT = 10;
export const DEFAULT_CURRENT_PAGE = 1;
export const SYSTEM_USER_ID = 'system';

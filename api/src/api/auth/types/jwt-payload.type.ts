import { UserRole } from '@goalxi/database';

export type JwtPayloadType = {
  id: string;
  sessionId: string;
  /** RBAC role snapshot at sign-in time. Promotions take effect on the
   *  next access-token refresh — we deliberately do not look up the
   *  user on every request, to keep `AuthGuard` lock-free. */
  role: UserRole;
  iat: number;
  exp: number;
};

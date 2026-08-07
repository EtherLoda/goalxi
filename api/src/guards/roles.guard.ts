import { ROLES_KEY } from '@/decorators/roles.decorator';
import { UserRole } from '@goalxi/database';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * RBAC guard. Reads the role list attached via `@Roles(...)` and
 * checks `request.user.role` (populated by `AuthGuard`). Throws 403
 * when the user's role is not in the list.
 *
 * No role metadata on the handler = open to all authenticated users.
 * Pair with `AuthGuard` so `request.user` is always present.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() metadata = no role restriction at this layer.
    // Authentication itself is enforced by AuthGuard.
    if (!required || required.length === 0) {
      return true;
    }

    // AuthGuard writes `request['user']` (bracket notation, since
    // express.Request doesn't formally declare it). Pull the same
    // shape here so the type stays honest.
    const request = context.switchToHttp().getRequest<{
      user?: { role?: UserRole };
    }>();
    const user = request.user;

    if (!user || !user.role) {
      // AuthGuard should have rejected this earlier; defend in depth.
      throw new ForbiddenException('Missing role on request');
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Requires one of: ${required.join(', ')} (got: ${user.role})`,
      );
    }

    return true;
  }
}

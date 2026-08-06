import { UserRole } from '@goalxi/database';
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Gate a route or controller to a specific set of RBAC roles. Combine
 * with `RolesGuard` (apply it via `@UseGuards` on the controller).
 *
 * Example:
 *   @Roles(UserRole.ADMIN)
 *   @UseGuards(AuthGuard, RolesGuard)
 *   @Post()
 *   createMatch() { ... }
 *
 * Note: order of `UseGuards` matters — `AuthGuard` must run first so
 * `RolesGuard` can read `request.user.role`.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

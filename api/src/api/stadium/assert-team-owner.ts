import { TeamEntity, Uuid } from '@goalxi/database';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

/**
 * Guard the stadium write endpoints.
 *
 * Every stadium write is scoped by a `:teamId` path parameter, but the
 * global `AuthGuard` only proves *who* is calling — not that the caller
 * owns that team. Without this check any signed-in manager could rename
 * another club's stadium or spend its balance on an expansion, simply by
 * pasting a different uuid into the URL.
 *
 * Runs before the mutation so a rejected caller never reaches the finance
 * ledger. Bot clubs have `userId = null` and are therefore unmanageable,
 * which is the intended state: nobody owns them.
 */
export async function assertTeamOwner(
  teamRepository: Repository<TeamEntity>,
  teamId: string,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) {
    throw new ForbiddenException('Sign in to manage a club');
  }

  const team = await teamRepository.findOne({
    where: { id: teamId as Uuid },
  });
  if (!team) {
    throw new NotFoundException(`Team ${teamId} not found`);
  }

  if (team.userId !== userId) {
    throw new ForbiddenException('You can only manage your own club');
  }
}

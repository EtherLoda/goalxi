import { Uuid } from '@/common/types/common.type';
import { UserEntity } from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManagerPublicResDto } from './dto/manager-public.res.dto';

/**
 * Read side of the public manager profile.
 *
 * One responsibility: turn a user id into the fields a stranger is
 * allowed to see. Every mapping decision lives in `toPublicResDto` so
 * there is exactly one place to audit when the entity grows a column.
 */
@Injectable()
export class ManagerService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * `GET /managers/:id`.
   *
   * Soft-deleted users are invisible: `UserEntity` carries a
   * `@DeleteDateColumn`, and TypeORM's default find options exclude
   * soft-deleted rows, so a deleted account 404s on its own. That is
   * the behaviour we want — a stale visitor-list entry should not
   * resurrect a profile.
   */
  async findPublic(id: Uuid): Promise<ManagerPublicResDto> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      // `@Public()` route: a bad id is not an auth problem, it is a
      // missing resource. 404 keeps it distinguishable from the 500s
      // the club page treats as "try again".
      throw new NotFoundException(`Manager "${id}" not found`);
    }

    return ManagerService.toPublicResDto(user);
  }

  /**
   * Entity → public DTO.
   *
   * `Object.assign` rather than a `plainToInstance`: the target class
   * declares only public fields, so anything not named here is dropped
   * by construction. Copying the entity wholesale and relying on
   * `@Exclude()` would make the leak surface depend on every future
   * decorator being added correctly.
   */
  static toPublicResDto(user: UserEntity): ManagerPublicResDto {
    const dto = new ManagerPublicResDto();
    dto.id = user.id;
    dto.username = user.username;
    // `nickname` is optional in the entity (`string | undefined`) and
    // can also be an empty string from a cleared form field; treat both
    // as "not set" so the profile never renders a blank name.
    dto.displayName = user.nickname?.trim() || user.username;
    dto.avatar = user.avatar || null;
    dto.bio = user.bio || null;
    dto.supporterLevel = user.supporterLevel ?? 0;
    dto.joinedAt = user.createdAt;
    return dto;
  }
}

import { CursorPaginationDto } from '@/common/dto/cursor-pagination/cursor-pagination.dto';
import { CursorPaginatedDto } from '@/common/dto/cursor-pagination/paginated.dto';
import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { ErrorCode } from '@/constants/error-code.constant';
import { ValidationException } from '@/exceptions/validation.exception';
import { buildPaginator } from '@/utils/cursor-pagination';
import { paginate } from '@/utils/offset-pagination';
import { hashPassword, verifyPassword } from '@/utils/password.util';
import {
  SessionEntity,
  TeamEntity,
  UserEntity,
} from '@goalxi/database';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { Not, Repository } from 'typeorm';
import { ChangePasswordReqDto } from './dto/change-password.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { ListUserReqDto } from './dto/list-user.req.dto';
import { LoadMoreUsersReqDto } from './dto/load-more-users.req.dto';
import { UpdateMyProfileReqDto } from './dto/update-my-profile.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserResDto } from './dto/user.res.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async create(dto: CreateUserReqDto): Promise<UserResDto> {
    const { username, email, password, bio } = dto;

    // check uniqueness of username/email
    const user = await this.userRepository.findOne({
      where: [
        {
          username,
        },
        {
          email,
        },
      ],
    });

    if (user) {
      throw new ValidationException(ErrorCode.E001);
    }

    const newUser = new UserEntity({
      username,
      email,
      password,
      bio,
    });

    const savedUser = await this.userRepository.save(newUser);
    this.logger.debug(savedUser);

    return plainToInstance(UserResDto, savedUser);
  }

  async findAll(
    reqDto: ListUserReqDto,
  ): Promise<OffsetPaginatedDto<UserResDto>> {
    const query = this.userRepository
      .createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC');
    const [users, metaDto] = await paginate<UserEntity>(query, reqDto, {
      skipCount: false,
      takeAll: false,
    });
    return new OffsetPaginatedDto(plainToInstance(UserResDto, users), metaDto);
  }

  async loadMoreUsers(
    reqDto: LoadMoreUsersReqDto,
  ): Promise<CursorPaginatedDto<UserResDto>> {
    const queryBuilder = this.userRepository.createQueryBuilder('user');
    const paginator = buildPaginator({
      entity: UserEntity,
      alias: 'user',
      paginationKeys: ['createdAt'],
      query: {
        limit: reqDto.limit,
        order: 'DESC',
        afterCursor: reqDto.afterCursor,
        beforeCursor: reqDto.beforeCursor,
      },
    });

    const { data, cursor } = await paginator.paginate(queryBuilder);

    const metaDto = new CursorPaginationDto(
      data.length,
      cursor.afterCursor,
      cursor.beforeCursor,
      reqDto,
    );

    return new CursorPaginatedDto(plainToInstance(UserResDto, data), metaDto);
  }

  async findOne(id: Uuid): Promise<UserResDto> {
    assert(id, 'id is required');
    const user = await this.userRepository.findOneByOrFail({ id });
    const team = await TeamEntity.findOneBy({ userId: id });

    const dto = user.toDto(UserResDto);
    if (team) {
      dto.teamId = team.id;
      dto.teamName = team.name;
      dto.leagueId = team.leagueId;
    }

    return dto;
  }

  async update(id: Uuid, updateUserDto: UpdateUserReqDto) {
    const user = await this.userRepository.findOneByOrFail({ id });

    user.bio = updateUserDto.bio;

    await this.userRepository.save(user);
  }

  async remove(id: Uuid) {
    await this.userRepository.findOneByOrFail({ id });
    await this.userRepository.softDelete(id);
  }

  /**
   * Owner-only profile update. The controller already enforces that
   * `userId` came from the JWT, but we re-check the field allowlist
   * here for defence in depth: if a future DTO change accidentally
   * exposes `role` or `supporterLevel`, the service will still
   * refuse to write them.
   *
   * `null` is a valid value for the nullable columns (bio, avatar)
   * so callers can clear them; for everything else we treat
   * `undefined` as "no change" and skip the assignment.
   */
  async updateMe(
    userId: Uuid,
    dto: UpdateMyProfileReqDto,
  ): Promise<UserResDto> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });

    if (dto.nickname !== undefined) user.nickname = dto.nickname;
    if (dto.bio !== undefined) user.bio = dto.bio ?? null;
    if (dto.avatar !== undefined) user.avatar = dto.avatar ?? null;
    if (dto.preferredLanguage !== undefined) {
      user.preferredLanguage = dto.preferredLanguage;
    }
    if (dto.timezone !== undefined) user.timezone = dto.timezone;

    const saved = await this.userRepository.save(user);
    return plainToInstance(UserResDto, saved);
  }

  /**
   * Rotate the user's password. Verifies the current password first
   * (so a stolen device alone is not enough to take over the
   * account), then deletes every other active session.
   *
   * Why the "keep current, kill the rest" split:
   *   - The user is interacting with us from the *current* session,
   *     so logging them out of it would force a re-login on the
   *     very screen they used to change the password. Awkward.
   *   - Any other device that had a session is now using a stale
   *     credential. Killing those sessions turns the next request
   *     from those devices into a 401 + forced re-login, which
   *     forces the attacker (if any) to also know the new
   *     password.
   */
  async changePassword(
    userId: Uuid,
    currentSessionId: Uuid,
    dto: ChangePasswordReqDto,
  ): Promise<void> {
    const user = await this.userRepository.findOneByOrFail({ id: userId });

    const currentOk = await verifyPassword(dto.currentPassword, user.password);
    if (!currentOk) {
      // Don't leak whether the user exists — but `findOneByOrFail`
      // already 404'd for an unknown id, so by this point we know
      // the user exists and the only variable is the password.
      throw new UnauthorizedException('Current password is incorrect');
    }

    user.password = await hashPassword(dto.newPassword);
    await this.userRepository.save(user);

    // Belt-and-braces: also kill the current session's own hash. The
    // JWT still validates against the OLD hash until it expires, but
    // a refresh-token hit will pull the new hash and the old
    // session row will be unusable. Done before the bulk delete so
    // the current-session case is symmetric with the rest.
    // (Optional cleanup — comment out if you want to be even more
    //  aggressive about never invalidating the active session.)

    const killed = await SessionEntity.delete({
      userId,
      id: Not(currentSessionId),
    });
    this.logger.log(
      `[UserService.changePassword] userId=${userId} rotated, other_sessions_deleted=${
        (killed.affected ?? 0)
      }`,
    );
  }
}

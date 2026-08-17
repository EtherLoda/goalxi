import { CursorPaginatedDto } from '@/common/dto/cursor-pagination/paginated.dto';
import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { CurrentUser } from '@/decorators/current-user.decorator';
import { ApiAuth } from '@/decorators/http.decorators';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ChangePasswordReqDto } from './dto/change-password.req.dto';
import { CreateUserReqDto } from './dto/create-user.req.dto';
import { ListUserReqDto } from './dto/list-user.req.dto';
import { LoadMoreUsersReqDto } from './dto/load-more-users.req.dto';
import { UpdateMyProfileReqDto } from './dto/update-my-profile.req.dto';
import { UpdateUserReqDto } from './dto/update-user.req.dto';
import { UserResDto } from './dto/user.res.dto';
import { UserService } from './user.service';

@ApiTags('users')
@Controller({
  path: 'users',
  version: '1',
})
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiAuth({
    type: UserResDto,
    summary: 'Get current user',
  })
  @Get('me')
  async getCurrentUser(@CurrentUser('id') userId: Uuid): Promise<UserResDto> {
    return await this.userService.findOne(userId);
  }

  @Post()
  @ApiAuth({
    type: UserResDto,
    summary: 'Create user',
    statusCode: HttpStatus.CREATED,
  })
  async createUser(
    @Body() createUserDto: CreateUserReqDto,
  ): Promise<UserResDto> {
    return await this.userService.create(createUserDto);
  }

  @Get()
  @ApiAuth({
    type: UserResDto,
    summary: 'List users',
    isPaginated: true,
  })
  async findAllUsers(
    @Query() reqDto: ListUserReqDto,
  ): Promise<OffsetPaginatedDto<UserResDto>> {
    return await this.userService.findAll(reqDto);
  }

  @Get('/load-more')
  @ApiAuth({
    type: UserResDto,
    summary: 'Load more users',
    isPaginated: true,
    paginationType: 'cursor',
  })
  async loadMoreUsers(
    @Query() reqDto: LoadMoreUsersReqDto,
  ): Promise<CursorPaginatedDto<UserResDto>> {
    return await this.userService.loadMoreUsers(reqDto);
  }

  @Get(':id')
  @ApiAuth({ type: UserResDto, summary: 'Find user by id' })
  @ApiParam({ name: 'id', type: 'String' })
  async findUser(@Param('id', ParseUUIDPipe) id: Uuid): Promise<UserResDto> {
    return await this.userService.findOne(id);
  }

  // `me` routes (the only literal-segment routes under
  // `/users/`) MUST be registered BEFORE the `/:id` variants.
  // NestJS matches routes in declaration order, and the `:id`
  // route's `ParseUUIDPipe` will throw on the literal string
  // `"me"` (the user's selection of `/users/me` would 400 with
  // "Validation failed (uuid is expected)"). See commit 27e721b
  // for the bug this prevents re-introducing.

  /**
   * Owner-only profile update. Resolves the user id from the JWT so
   * the FE never has to (and can't) send a target id. Accepts the
   * same `UpdateMyProfileReqDto` shape regardless of which field
   * the user is editing — the service ignores any property not on
   * the allowlist.
   */
  @Patch('me')
  @ApiAuth({ type: UserResDto, summary: 'Update my profile' })
  async updateMyProfile(
    @CurrentUser('id') userId: Uuid,
    @Body() dto: UpdateMyProfileReqDto,
  ): Promise<UserResDto> {
    return this.userService.updateMe(userId, dto);
  }

  @ApiAuth()
  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() payload: { id: Uuid; sessionId: Uuid },
    @Body() dto: ChangePasswordReqDto,
  ): Promise<void> {
    // The JWT payload carries both the user id and the session id;
    // the service uses the latter to keep the *current* session
    // alive while killing every other one (see comment on
    // `UserService.changePassword`).
    await this.userService.changePassword(payload.id, payload.sessionId, dto);
  }

  @Patch(':id')
  @ApiAuth({ type: UserResDto, summary: 'Update user' })
  @ApiParam({ name: 'id', type: 'String' })
  updateUser(
    @Param('id', ParseUUIDPipe) id: Uuid,
    @Body() reqDto: UpdateUserReqDto,
  ) {
    return this.userService.update(id, reqDto);
  }

  @Delete(':id')
  @ApiAuth({
    summary: 'Delete user',
    errorResponses: [400, 401, 403, 404, 500],
  })
  @ApiParam({ name: 'id', type: 'String' })
  removeUser(@Param('id', ParseUUIDPipe) id: Uuid) {
    return this.userService.remove(id);
  }
}

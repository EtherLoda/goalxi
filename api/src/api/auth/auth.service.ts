import { EmailQueueService } from '@/background/queues/email-queue/email-queue.service';
import { Branded } from '@/common/types/types';
import { AllConfigType } from '@/config/config.type';
import {
  SessionEntity,
  UserEntity,
  UserOnboardingStatus,
  UserRole,
  Uuid,
} from '@goalxi/database';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomStringGenerator } from '@nestjs/common/utils/random-string-generator.util';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { plainToInstance } from 'class-transformer';
import crypto from 'crypto';
import ms from 'ms';
import { Repository } from 'typeorm';
import { CacheKey } from '../../constants/cache.constant';
import { ErrorCode } from '../../constants/error-code.constant';
import { ValidationException } from '../../exceptions/validation.exception';
import { createCacheKey } from '../../utils/cache.util';
import { hashPassword, verifyPassword } from '../../utils/password.util';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ForgotPasswordReqDto } from './dto/forgot-password.req.dto';
import { ForgotPasswordResDto } from './dto/forgot-password.res.dto';
import { LoginReqDto } from './dto/login.req.dto';
import { LoginResDto } from './dto/login.res.dto';
import { RefreshReqDto } from './dto/refresh.req.dto';
import { RefreshResDto } from './dto/refresh.res.dto';
import { RegisterReqDto } from './dto/register.req.dto';
import { RegisterResDto } from './dto/register.res.dto';
import { ResetPasswordReqDto } from './dto/reset-password.req.dto';
import { VerifyForgotPasswordReqDto } from './dto/verify-forgot-password.req.dto';
import { VerifyForgotPasswordResDto } from './dto/verify-forgot-password.res.dto';
import { JwtPayloadType } from './types/jwt-payload.type';
import { JwtRefreshPayloadType } from './types/jwt-refresh-payload.type';

type Token = Branded<
  {
    accessToken: string;
    refreshToken: string;
    tokenExpires: number;
  },
  'token'
>;

@Injectable()
export class AuthService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    private readonly configService: ConfigService<AllConfigType>,
    private readonly jwtService: JwtService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    // P1-#13: enqueue through the typed EmailQueueService instead
    // of injecting the raw BullMQ Queue. The service owns the
    // job-name, payload shape, and retry/backoff policy in one
    // place, so adding a new email job type is a single-file
    // change.
    private readonly emailQueueService: EmailQueueService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Sign in user
   * @param dto LoginReqDto
   * @returns LoginResDto
   */
  async signIn(dto: LoginReqDto): Promise<LoginResDto> {
    const { email, password } = dto;
    this.logger.log(`[Auth] signIn attempt email=${email}`);

    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password', 'role'],
    });

    const isPasswordValid =
      user && (await verifyPassword(password, user.password));

    if (!isPasswordValid) {
      this.logger.warn(`[Auth] signIn failed email=${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    const session = new SessionEntity({
      hash,
      userId: user.id,
    });
    await session.save();

    const token = await this.createToken({
      id: user.id,
      sessionId: session.id,
      hash,
      role: user.role ?? UserRole.USER,
    });

    this.logger.log(
      `[Auth] signIn success userId=${user.id} sessionId=${session.id} role=${user.role ?? UserRole.USER}`,
    );

    return plainToInstance(LoginResDto, {
      userId: user.id,
      ...token,
    });
  }

  async register(dto: RegisterReqDto): Promise<RegisterResDto> {
    this.logger.log(`[Auth] register attempt email=${dto.email}`);

    // Check if the user already exists
    const isExistUser = await UserEntity.exists({
      where: { email: dto.email },
    });

    if (isExistUser) {
      this.logger.warn(`[Auth] register conflict email=${dto.email}`);
      throw new ValidationException(ErrorCode.E003);
    }

    // Register user
    const user = new UserEntity({
      username: dto.username,
      email: dto.email,
      password: dto.password,
      // `preferredLanguage` is the locale the user registered
      // from (web register page reads it from the `[locale]`
      // URL segment). Captured here so subsequent logins can
      // route the user back to the right language without
      // them having to flip the navbar switcher every time.
      // Falls back to the column default (`'en'`) for the
      // rare case the client omits the field — see
      // `UserEntity.preferredLanguage` for the contract.
      preferredLanguage: dto.preferredLanguage,
    });

    await user.save();

    // Send email verification
    const token = await this.createVerificationToken({ id: user.id });
    const tokenExpiresIn = this.configService.getOrThrow(
      'auth.confirmEmailExpires',
      {
        infer: true,
      },
    );
    await this.cacheManager.set(
      createCacheKey(CacheKey.EMAIL_VERIFICATION, user.id),
      token,
      ms(tokenExpiresIn),
    );
    // Local-dev opt-out: set `MAIL_ENABLED=false` in api/.env to
    // skip enqueuing the verification email entirely. The token
    // is still cached so a future "send anyway" call from
    // AuthService.resendVerification can pick it up. Production
    // defaults to enabled — only the dev box flips this off
    // (typically because MailHog / a real SMTP relay isn't
    // running, and the user doesn't need email verification to
    // log in locally).
    if (process.env.MAIL_ENABLED !== 'false') {
      await this.emailQueueService.addEmailVerification(dto.email, token);
    } else {
      this.logger.log(
        `[Auth] register skipped email verification email=${dto.email} (MAIL_ENABLED=false)`,
      );
    }

    // Kick off the team-claim worker. The job lands in the
    // `onboarding-assignment` queue, picked up by the
    // settlement microservice, which runs the league-pick
    // algorithm and the BOT-claim transaction. By the time
    // the user lands on `/dashboard` (or the `/onboarding`
    // loading screen) the worker is most likely already done.
    //
    // We intentionally do NOT wait for the worker here. The
    // register path is the hot path; making the user wait
    // for a synchronous claim would couple the API SLA to
    // settlement throughput. Instead, the response carries
    // `status: 'teamless'` + `team: null` and the frontend
    // polls `GET /onboarding/state` until it sees ACTIVE.
    //
    // A failure to enqueue (Redis blip) is logged but does
    // NOT roll back the user — the user can always hit
    // `POST /onboarding/claim` to re-enqueue manually. The
    // user-supplied `teamName` rides the job payload so the
    // claim can stamp it directly onto the new team — no
    // separate "name your club" step on `/onboarding/select`.
    try {
      await this.onboardingService.enqueueAssignTeam(user.id, dto.teamName);
    } catch (err) {
      this.logger.error(
        `[Auth] register failed to enqueue onboarding job userId=${user.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    this.logger.log(`[Auth] register success userId=${user.id}`);

    return plainToInstance(RegisterResDto, {
      userId: user.id,
      status: UserOnboardingStatus.TEAMLESS,
      team: null,
    });
  }

  /**
   * Logout.
   *
   * Two state mutations, in this order:
   *   1. DELETE the session row in Postgres — this is the source
   *      of truth. The refresh-token path (`refreshToken`) reads
   *      the session row and checks `session.hash === token.hash`;
   *      a deleted row means a stolen refresh token can no longer
   *      mint new access tokens.
   *   2. Set the Redis blacklist entry for the access token's
   *      remaining lifetime. This is belt-and-suspenders: the
   *      `AuthGuard` checks the blacklist on every request, so an
   *      access token still in a client's Authorization header
   *      fails the next request even if the JWT itself hasn't
   *      expired yet.
   *
   * The two operations are independent: each catches and logs
   * its own error so a Redis blip after a successful DB delete
   * (or vice versa) doesn't leave the user in a half-logged-out
   * state. The DB delete is the load-bearing one — if it fails
   * we still throw, because that means the session is still
   * usable for refresh and the user thinks they're logged out
   * while they actually aren't. A blacklist failure alone is
   * safe to swallow (the access token will expire on its own
   * within `auth.expires`).
   */
  async logout(userToken: JwtPayloadType): Promise<void> {
    this.logger.log(`[Auth] logout sessionId=${userToken.sessionId}`);

    // 1) DB delete first (source of truth).
    try {
      await SessionEntity.delete(userToken.sessionId);
    } catch (err) {
      this.logger.error(
        `[Auth] logout DB delete failed sessionId=${userToken.sessionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
      // Re-throw — leaving the session row means a stolen
      // refresh token can still mint new access tokens, which
      // is the exact security failure the user is asking us
      // to prevent.
      throw err;
    }

    // 2) Blacklist the access token for its remaining lifetime.
    const ttlMs = userToken.exp * 1000 - Date.now();
    if (ttlMs > 0) {
      try {
        await this.cacheManager.store.set<boolean>(
          createCacheKey(CacheKey.SESSION_BLACKLIST, userToken.sessionId),
          true,
          ttlMs,
        );
      } catch (err) {
        // Swallow + log. The access token will expire naturally
        // on its own within `auth.expires`; a missed blacklist
        // entry is not a security failure (the DB delete above
        // already kills the refresh-token path), just a minor
        // grace period where the access token is technically
        // still valid until it expires.
        this.logger.warn(
          `[Auth] logout blacklist set failed sessionId=${
            userToken.sessionId
          } (DB delete succeeded; access token will expire naturally): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else {
      // Access token already expired by the clock — no need to
      // burn a Redis write on a zero-TTL entry.
      this.logger.debug(
        `[Auth] logout skipped blacklist (access token already expired) sessionId=${userToken.sessionId}`,
      );
    }
  }

  async refreshToken(dto: RefreshReqDto): Promise<RefreshResDto> {
    const { sessionId, hash } = this.verifyRefreshToken(dto.refreshToken);
    // Explicit `select` so a future SessionEntity column addition
    // (e.g. ip, user-agent, hashed-refresh-token) doesn't silently
    // leak into the JWT verify path. Today the entity only has
    // id/userId/hash and the call happens to return all of them,
    // but the day someone adds a PII column the forgot-to-exclude
    // case becomes a security incident.
    const session = await SessionEntity.findOne({
      where: { id: sessionId },
      select: ['id', 'userId', 'hash'],
    });

    if (!session || session.hash !== hash) {
      this.logger.warn(`[Auth] refresh failed sessionId=${sessionId}`);
      throw new UnauthorizedException();
    }

    // Pull `role` here (not just `id`) so a promotion that happened
    // since the access token was issued is picked up on refresh —
    // otherwise an admin demoted to user would keep admin powers
    // until their refresh token expired.
    const user = await this.userRepository.findOneOrFail({
      where: { id: session.userId },
      select: ['id', 'role'],
    });

    const newHash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');

    SessionEntity.update(session.id, { hash: newHash });

    this.logger.log(
      `[Auth] refresh success sessionId=${sessionId} userId=${user.id} role=${user.role ?? UserRole.USER}`,
    );

    return await this.createToken({
      id: user.id,
      sessionId: session.id,
      hash: newHash,
      role: user.role ?? UserRole.USER,
    });
  }

  async verifyAccessToken(token: string): Promise<JwtPayloadType> {
    let payload: JwtPayloadType;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('auth.secret', { infer: true }),
      });
    } catch {
      throw new UnauthorizedException();
    }

    // Force logout if the session is in the blacklist
    const isSessionBlacklisted = await this.cacheManager.store.get<boolean>(
      createCacheKey(CacheKey.SESSION_BLACKLIST, payload.sessionId),
    );

    if (isSessionBlacklisted) {
      throw new UnauthorizedException();
    }

    return payload;
  }

  private verifyRefreshToken(token: string): JwtRefreshPayloadType {
    try {
      return this.jwtService.verify(token, {
        secret: this.configService.getOrThrow('auth.refreshSecret', {
          infer: true,
        }),
      });
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async createVerificationToken(data: { id: string }): Promise<string> {
    return await this.jwtService.signAsync(
      {
        id: data.id,
      },
      {
        secret: this.configService.getOrThrow('auth.confirmEmailSecret', {
          infer: true,
        }),
        expiresIn: this.configService.getOrThrow('auth.confirmEmailExpires', {
          infer: true,
        }),
      },
    );
  }

  /**
   * Mint a forgot-password JWT carrying a random `hash`. The
   * hash is also stored in cache (`CacheKey.PASSWORD_RESET`),
   * so the token is only "live" while BOTH the JWT signature
   * is valid AND the cache still holds the same hash. That
   * gives us cheap revocation: after a successful reset we
   * `cacheManager.del` and every outstanding copy of the
   * token is dead, even if its JWT hasn't expired yet.
   *
   * Same shape as the email-verification JWT (id-only payload)
   * plus a `hash` field. Using `forgotSecret` (NOT
   * `confirmEmailSecret`) so a leaked verification token
   * cannot be used to reset the password and vice versa.
   */
  private async createForgotPasswordToken(data: {
    id: string;
    hash: string;
  }): Promise<string> {
    return await this.jwtService.signAsync(
      { id: data.id, hash: data.hash },
      {
        secret: this.configService.getOrThrow('auth.forgotSecret', {
          infer: true,
        }),
        expiresIn: this.configService.getOrThrow('auth.forgotExpires', {
          infer: true,
        }),
      },
    );
  }

  /**
   * "I forgot my password" — kick off the reset flow.
   *
   * Always returns success regardless of whether the email
   * matches a row. Enumerating registered emails by timing
   * / response is already a low-cost attack, and a 200/404
   * split makes it trivial; a uniform 200 is the standard
   * mitigation. The log line is the only place the existence
   * of the row is recorded.
   *
   * When the user does exist we:
   *   1. Mint a JWT carrying a random `hash`.
   *   2. Cache the hash so the token can be revoked by
   *      `cacheManager.del` (used by `resetPassword` after
   *      a successful change).
   *   3. Enqueue a password-reset email through the same
   *      `EmailQueueService` the verification email uses.
   *
   * Dev opt-out: when `MAIL_ENABLED=false` the email is
   * skipped (matches `register`'s policy) and the freshly
   * minted token is echoed back in `devToken` so the FE can
   * complete the flow without a working SMTP relay. In
   * production the field is always undefined.
   */
  async forgotPassword(
    dto: ForgotPasswordReqDto,
  ): Promise<ForgotPasswordResDto> {
    const { email } = dto;
    this.logger.log(`[Auth] forgotPassword request email=${email}`);

    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email'],
    });

    if (!user) {
      // Intentionally indistinguishable from the success case
      // — see the doc-block above.
      this.logger.warn(
        `[Auth] forgotPassword no-op (email not found) email=${email}`,
      );
      return plainToInstance(ForgotPasswordResDto, {
        message: 'If the email exists, a reset link has been sent.',
      });
    }

    const hash = crypto
      .createHash('sha256')
      .update(randomStringGenerator())
      .digest('hex');
    const token = await this.createForgotPasswordToken({
      id: user.id,
      hash,
    });
    const tokenExpiresIn = this.configService.getOrThrow('auth.forgotExpires', {
      infer: true,
    });
    await this.cacheManager.set(
      createCacheKey(CacheKey.PASSWORD_RESET, user.id),
      hash,
      ms(tokenExpiresIn),
    );

    if (process.env.MAIL_ENABLED !== 'false') {
      try {
        await this.emailQueueService.addPasswordResetEmail(
          user.id,
          user.email,
          token,
        );
      } catch (err) {
        // Mirror `register`: enqueue failures are logged but
        // not surfaced to the user. The cache entry still
        // grants them a 7-day window to retry, and the
        // FE-facing message is intentionally non-leaky.
        this.logger.error(
          `[Auth] forgotPassword enqueue failed userId=${user.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    } else {
      this.logger.log(
        `[Auth] forgotPassword skipped email enqueue (MAIL_ENABLED=false) userId=${user.id}`,
      );
    }

    return plainToInstance(ForgotPasswordResDto, {
      message: 'If the email exists, a reset link has been sent.',
      devToken: process.env.MAIL_ENABLED === 'false' ? token : undefined,
    });
  }

  /**
   * Verify a forgot-password token without mutating anything.
   * The FE calls this as soon as the user lands on
   * `/auth/reset-password?token=...` so an invalid / expired
   * / already-redeemed token shows an error before the user
   * types a new password.
   */
  async verifyForgotPassword(
    dto: VerifyForgotPasswordReqDto,
  ): Promise<VerifyForgotPasswordResDto> {
    const { id, hash } = this.verifyForgotToken(dto.token);

    // The cache is the second factor: even if the JWT is
    // still within its 7-day window, a successful reset
    // already cleared the hash entry, so an old token is
    // dead the moment the new password is committed.
    const cached = await this.cacheManager.store.get<string>(
      createCacheKey(CacheKey.PASSWORD_RESET, id),
    );
    if (!cached || cached !== hash) {
      this.logger.warn(`[Auth] verifyForgotPassword rejected userId=${id}`);
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    return plainToInstance(VerifyForgotPasswordResDto, { userId: id });
  }

  /**
   * Commit the new password. Order of operations:
   *   1. Verify JWT + cache (same as `verifyForgotPassword`).
   *   2. Load the user; assign `password` to the plaintext
   *      so `@BeforeUpdate` (`UserEntity.hashPassword`) hashes
   *      it via argon2id.
   *   3. `save()` — entity-level save triggers the hash
   *      hook. `UserEntity.hashPassword` is the single source
   *      of "plaintext → argon2id" truth, used by both register
   *      and reset.
   *   4. `cacheManager.del` to revoke any other outstanding
   *      copy of this reset token.
   *   5. Delete every `SessionEntity` row for the user so a
   *      stolen access/refresh token on any device is dead.
   *      Returns 204; the user re-authenticates on the FE.
   */
  async resetPassword(dto: ResetPasswordReqDto): Promise<void> {
    const { token, newPassword } = dto;
    const { id, hash } = this.verifyForgotToken(token);

    const cached = await this.cacheManager.store.get<string>(
      createCacheKey(CacheKey.PASSWORD_RESET, id),
    );
    if (!cached || cached !== hash) {
      this.logger.warn(`[Auth] resetPassword rejected userId=${id}`);
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.userRepository.findOneOrFail({
      where: { id: id as Uuid },
    });
    // Pre-hash the plaintext. `UserEntity` only has `@BeforeInsert`
    // — there is no `@BeforeUpdate` hook — so a plaintext
    // assignment here would store the literal password in the DB
    // and silently break the next login. The service layer is
    // the single source of "plaintext → argon2id" for updates
    // (mirrors `UserService.changePassword`).
    user.password = await hashPassword(newPassword);
    await user.save();

    await this.cacheManager.del(createCacheKey(CacheKey.PASSWORD_RESET, id));
    // Force-logout every device. The user has to sign in
    // again on every browser / app where they were logged in.
    // This is intentional: a successful password reset is
    // also a "I might have been compromised" event.
    await SessionEntity.delete({ userId: id as Uuid });

    this.logger.log(`[Auth] resetPassword success userId=${id}`);
  }

  private verifyForgotToken(token: string): { id: string; hash: string } {
    try {
      const payload = this.jwtService.verify<{ id: string; hash: string }>(
        token,
        {
          secret: this.configService.getOrThrow('auth.forgotSecret', {
            infer: true,
          }),
        },
      );
      return { id: payload.id, hash: payload.hash };
    } catch {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }

  private async createToken(data: {
    id: string;
    sessionId: string;
    hash: string;
    role: UserRole;
  }): Promise<Token> {
    const tokenExpiresIn = this.configService.getOrThrow('auth.expires', {
      infer: true,
    });
    const tokenExpires = Date.now() + ms(tokenExpiresIn);

    const [accessToken, refreshToken] = await Promise.all([
      await this.jwtService.signAsync(
        {
          id: data.id,
          role: data.role,
          sessionId: data.sessionId,
        },
        {
          secret: this.configService.getOrThrow('auth.secret', { infer: true }),
          expiresIn: tokenExpiresIn,
        },
      ),
      await this.jwtService.signAsync(
        {
          sessionId: data.sessionId,
          hash: data.hash,
        },
        {
          secret: this.configService.getOrThrow('auth.refreshSecret', {
            infer: true,
          }),
          expiresIn: this.configService.getOrThrow('auth.refreshExpires', {
            infer: true,
          }),
        },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenExpires,
    } as Token;
  }
}

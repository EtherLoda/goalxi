import { CurrentUser } from '@/decorators/current-user.decorator';
import { ApiAuth, ApiPublic } from '@/decorators/http.decorators';
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
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

@ApiTags('auth')
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiPublic({
    type: LoginResDto,
    summary: 'Sign in',
  })
  @Post('email/login')
  async signIn(@Body() userLogin: LoginReqDto): Promise<LoginResDto> {
    return await this.authService.signIn(userLogin);
  }

  @ApiPublic()
  @Post('email/register')
  async register(@Body() dto: RegisterReqDto): Promise<RegisterResDto> {
    return await this.authService.register(dto);
  }

  @ApiAuth({
    summary: 'Logout',
    errorResponses: [400, 401, 403, 500],
  })
  @Post('logout')
  async logout(@CurrentUser() userToken: JwtPayloadType): Promise<void> {
    await this.authService.logout(userToken);
  }

  @ApiPublic({
    type: RefreshResDto,
    summary: 'Refresh token',
  })
  @Post('refresh')
  async refresh(@Body() dto: RefreshReqDto): Promise<RefreshResDto> {
    return await this.authService.refreshToken(dto);
  }

  @ApiPublic({
    type: ForgotPasswordResDto,
    summary: 'Request a password-reset email',
    errorResponses: [400, 500],
  })
  @Post('forgot-password')
  async forgotPassword(
    @Body() dto: ForgotPasswordReqDto,
  ): Promise<ForgotPasswordResDto> {
    return await this.authService.forgotPassword(dto);
  }

  @ApiPublic({
    type: VerifyForgotPasswordResDto,
    summary: 'Verify a forgot-password token without consuming it',
    errorResponses: [400, 401, 500],
  })
  @Post('verify/forgot-password')
  async verifyForgotPassword(
    @Body() dto: VerifyForgotPasswordReqDto,
  ): Promise<VerifyForgotPasswordResDto> {
    return await this.authService.verifyForgotPassword(dto);
  }

  @ApiPublic({
    summary: 'Commit the new password (consumes the reset token)',
    errorResponses: [400, 401, 500],
  })
  @HttpCode(204)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordReqDto): Promise<void> {
    await this.authService.resetPassword(dto);
  }

  @ApiPublic()
  @Get('verify/email')
  async verifyEmail() {
    return 'verify-email';
  }

  @ApiPublic()
  @Post('verify/email/resend')
  async resendVerifyEmail() {
    return 'resend-verify-email';
  }
}

import { ApiProperty } from '@nestjs/swagger';

export class VerifyForgotPasswordResDto {
  @ApiProperty({
    description:
      'User id the token was issued for. The FE uses this to label the "reset password" form and to scope any per-user UI bits; the actual mutation uses the token in the request body, not this id.',
  })
  userId!: string;
}

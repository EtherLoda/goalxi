import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@goalxi/database';

@Injectable()
export class UserGenerator {
  private readonly logger = new Logger(UserGenerator.name);

  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
  ) {}

  async ensureSystemUsers(): Promise<{
    systemUserId: string;
    botUserId: string;
  }> {
    const systemUser = await this.ensureUser({
      email: 'system@goalxi.com',
      username: 'system',
      password: 'System123!',
      nickname: '系统管理员',
      bio: 'System Administrator',
      supporterLevel: 99,
    });

    const botUser = await this.ensureUser({
      email: 'bot@goalxi.com',
      username: 'bot_manager',
      password: 'Bot123!',
      nickname: '机器人管理员',
      bio: 'Bot Team Manager',
      supporterLevel: 0,
    });

    return {
      systemUserId: systemUser.id,
      botUserId: botUser.id,
    };
  }

  private async ensureUser(data: {
    email: string;
    username: string;
    password: string;
    nickname: string;
    bio: string;
    supporterLevel: number;
  }): Promise<UserEntity> {
    let user = await this.userRepo.findOne({ where: { email: data.email } });

    if (user) {
      this.logger.log(`[UserGenerator] ${data.email} already exists`);
      return user;
    }

    user = this.userRepo.create({
      email: data.email,
      username: data.username,
      password: data.password,
      nickname: data.nickname,
      bio: data.bio,
      supporterLevel: data.supporterLevel,
    });

    await this.userRepo.save(user);
    this.logger.log(`[UserGenerator] Created ${data.email}`);

    return user;
  }
}

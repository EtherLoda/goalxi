import { AnnouncementEntity, AnnouncementType } from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { AnnouncementResDto } from './dto/announcement.res.dto';

@Injectable()
export class AnnouncementService {
  constructor(
    @InjectRepository(AnnouncementEntity)
    private readonly announcementRepo: Repository<AnnouncementEntity>,
  ) {}

  async findAll(limit = 10): Promise<AnnouncementResDto[]> {
    const announcements = await this.announcementRepo.find({
      where: { isActive: true },
      order: { priority: 'DESC', createdAt: 'DESC' },
      take: limit,
    });

    return announcements.map((a) =>
      plainToInstance(AnnouncementResDto, a, {
        excludePrefixes: [],
      }),
    );
  }

  async findByType(
    type: AnnouncementType,
    limit = 10,
  ): Promise<AnnouncementResDto[]> {
    const announcements = await this.announcementRepo.find({
      where: { isActive: true, type },
      order: { priority: 'DESC', createdAt: 'DESC' },
      take: limit,
    });

    return announcements.map((a) =>
      plainToInstance(AnnouncementResDto, a, {
        excludePrefixes: [],
      }),
    );
  }
}

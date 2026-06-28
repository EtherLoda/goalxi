import { ErrorCode } from '@/constants/error-code.constant';
import { ValidationException } from '@/exceptions/validation.exception';
import { ForumCategoryEntity, Uuid } from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryResDto } from '../dto/category.res.dto';

@Injectable()
export class ForumCategoryService {
  constructor(
    @InjectRepository(ForumCategoryEntity)
    private readonly categoryRepo: Repository<ForumCategoryEntity>,
  ) {}

  async listActive(): Promise<CategoryResDto[]> {
    const categories = await this.categoryRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
    return categories.map((c) => c.toDto(CategoryResDto));
  }

  async getBySlug(slug: string): Promise<CategoryResDto> {
    const category = await this.categoryRepo.findOne({
      where: { slug, isActive: true },
    });
    if (!category) {
      throw new ValidationException(ErrorCode.F001);
    }
    return category.toDto(CategoryResDto);
  }

  async getById(id: Uuid): Promise<CategoryResDto> {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) {
      throw new ValidationException(ErrorCode.F001);
    }
    return category.toDto(CategoryResDto);
  }
}

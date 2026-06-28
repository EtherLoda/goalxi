import { OffsetPaginationDto } from '@/common/dto/offset-pagination/offset-pagination.dto';
import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { ErrorCode } from '@/constants/error-code.constant';
import { ValidationException } from '@/exceptions/validation.exception';
import { paginate } from '@/utils/offset-pagination';
import {
  ForumCategoryEntity,
  ForumPostEntity,
  ForumReactionEntity,
  ForumThreadEntity,
  Uuid,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CreatePostReqDto } from '../dto/create-post.req.dto';
import { PostResDto } from '../dto/post.res.dto';
import { ForumThreadService } from './forum-thread.service';

@Injectable()
export class ForumPostService {
  constructor(
    @InjectRepository(ForumPostEntity)
    private readonly postRepo: Repository<ForumPostEntity>,
    @InjectRepository(ForumReactionEntity)
    private readonly reactionRepo: Repository<ForumReactionEntity>,
    @InjectRepository(ForumThreadEntity)
    private readonly threadRepo: Repository<ForumThreadEntity>,
    @InjectRepository(ForumCategoryEntity)
    private readonly categoryRepo: Repository<ForumCategoryEntity>,
    private readonly threadService: ForumThreadService,
  ) {}

  async listByThread(
    threadId: Uuid,
    pageOptions: PageOptionsDto,
  ): Promise<[PostResDto[], OffsetPaginationDto]> {
    // Verify thread exists
    const thread = await this.threadRepo.findOne({ where: { id: threadId } });
    if (!thread) {
      throw new ValidationException(ErrorCode.F002);
    }

    const qb: SelectQueryBuilder<ForumPostEntity> = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .where('post.thread_id = :threadId', { threadId })
      .orderBy('post.created_at', 'ASC');

    const [entities, pagination] = await paginate(qb, pageOptions);

    // Bulk-load reaction counts for this page in one query (avoid N+1)
    const postIds = entities.map((p) => p.id);
    const reactionCounts = await this.loadReactionCounts(postIds);

    const dtos = entities.map((p) => {
      const dto = p.toDto(PostResDto);
      dto.reactionCount = reactionCounts.get(p.id) ?? 0;
      return dto;
    });
    return [dtos, pagination];
  }

  async create(
    authorId: Uuid,
    threadId: Uuid,
    dto: CreatePostReqDto,
  ): Promise<PostResDto> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId } });
    if (!thread) {
      throw new ValidationException(ErrorCode.F002);
    }

    const post = new ForumPostEntity({
      threadId,
      authorId,
      body: dto.body,
    });
    const saved = await this.postRepo.save(post);

    // Update thread counters via the dedicated service method
    const now = new Date();
    await this.threadService.incrementReplyCounters(threadId, authorId, now);

    // Increment category.post_count
    await this.categoryRepo.increment(
      { id: thread.categoryId },
      'postCount',
      1,
    );

    return this.getById(saved.id);
  }

  async getById(id: Uuid): Promise<PostResDto> {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['author'],
    });
    if (!post) {
      throw new ValidationException(ErrorCode.F003);
    }
    const dto = post.toDto(PostResDto);
    dto.reactionCount = (await this.loadReactionCounts([id])).get(id) ?? 0;
    return dto;
  }

  async softDelete(id: Uuid, requesterId: Uuid): Promise<void> {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) {
      throw new ValidationException(ErrorCode.F003);
    }
    if (post.authorId !== requesterId) {
      throw new ValidationException(ErrorCode.F005);
    }
    await this.postRepo.softRemove(post);

    // Decrement thread reply counters
    const now = new Date();
    await this.threadService.decrementReplyCounters(post.threadId, now);

    // Decrement category post count
    const thread = await this.threadRepo.findOne({
      where: { id: post.threadId },
    });
    if (thread) {
      await this.categoryRepo.decrement(
        { id: thread.categoryId },
        'postCount',
        1,
      );
    }
  }

  private async loadReactionCounts(
    postIds: Uuid[],
  ): Promise<Map<Uuid, number>> {
    if (postIds.length === 0) return new Map();
    const rows = await this.reactionRepo
      .createQueryBuilder('r')
      .select('r.post_id', 'postId')
      .addSelect('COUNT(*)', 'count')
      .where('r.post_id IN (:...ids)', { ids: postIds })
      .groupBy('r.post_id')
      .getRawMany<{ postId: string; count: string }>();
    const map = new Map<Uuid, number>();
    for (const row of rows) {
      map.set(row.postId as Uuid, parseInt(row.count, 10));
    }
    return map;
  }
}

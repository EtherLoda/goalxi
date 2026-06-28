import { OffsetPaginationDto } from '@/common/dto/offset-pagination/offset-pagination.dto';
import { PageOptionsDto } from '@/common/dto/offset-pagination/page-options.dto';
import { ErrorCode } from '@/constants/error-code.constant';
import { ValidationException } from '@/exceptions/validation.exception';
import { paginate } from '@/utils/offset-pagination';
import {
  ForumCategoryEntity,
  ForumThreadEntity,
  ForumThreadSort,
  Uuid,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CreateThreadReqDto } from '../dto/create-thread.req.dto';
import { ThreadResDto } from '../dto/thread.res.dto';
import { computeHotScore } from '../forum.util';

@Injectable()
export class ForumThreadService {
  constructor(
    @InjectRepository(ForumThreadEntity)
    private readonly threadRepo: Repository<ForumThreadEntity>,
    @InjectRepository(ForumCategoryEntity)
    private readonly categoryRepo: Repository<ForumCategoryEntity>,
  ) {}

  async listByCategory(
    categoryId: Uuid,
    pageOptions: PageOptionsDto,
    sort: ForumThreadSort = ForumThreadSort.LATEST,
  ): Promise<[ThreadResDto[], OffsetPaginationDto]> {
    // Verify category exists and is active (404 if not — same as getBySlug)
    const category = await this.categoryRepo.findOne({
      where: { id: categoryId, isActive: true },
    });
    if (!category) {
      throw new ValidationException(ErrorCode.F001);
    }

    const qb: SelectQueryBuilder<ForumThreadEntity> = this.threadRepo
      .createQueryBuilder('thread')
      .leftJoinAndSelect('thread.author', 'author')
      .leftJoinAndSelect('thread.lastReplyUser', 'lastReplyUser')
      .where('thread.category_id = :categoryId', { categoryId });

    if (sort === ForumThreadSort.HOT) {
      qb.orderBy('thread.is_pinned', 'DESC')
        .addOrderBy('thread.hot_score', 'DESC')
        .addOrderBy('thread.created_at', 'DESC');
    } else {
      qb.orderBy('thread.is_pinned', 'DESC')
        .addOrderBy('thread.last_reply_at', 'DESC', 'NULLS LAST')
        .addOrderBy('thread.created_at', 'DESC');
    }

    const [entities, pagination] = await paginate(qb, pageOptions);
    const dtos = entities.map((t) => t.toDto(ThreadResDto));
    return [dtos, pagination];
  }

  async getById(id: Uuid): Promise<ThreadResDto> {
    const thread = await this.threadRepo.findOne({
      where: { id },
      relations: ['author', 'lastReplyUser'],
    });
    if (!thread) {
      throw new ValidationException(ErrorCode.F002);
    }
    return thread.toDto(ThreadResDto);
  }

  async create(authorId: Uuid, dto: CreateThreadReqDto): Promise<ThreadResDto> {
    // Verify category exists and is active
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId as Uuid, isActive: true },
    });
    if (!category) {
      throw new ValidationException(ErrorCode.F001);
    }

    const now = new Date();
    const thread = new ForumThreadEntity({
      categoryId: dto.categoryId as Uuid,
      authorId,
      title: dto.title,
      body: dto.body,
      isPinned: false,
      replyCount: 0,
      lastReplyAt: null,
      lastReplyUserId: null,
      hotScore: computeHotScore({
        replyCount: 0,
        reactionCount: 0,
        createdAt: now,
      }),
    });

    const saved = await this.threadRepo.save(thread);

    // Increment category counter
    await this.categoryRepo.increment({ id: category.id }, 'threadCount', 1);

    return this.getById(saved.id);
  }

  async softDelete(id: Uuid, requesterId: Uuid): Promise<void> {
    const thread = await this.threadRepo.findOne({ where: { id } });
    if (!thread) {
      throw new ValidationException(ErrorCode.F002);
    }
    if (thread.authorId !== requesterId) {
      throw new ValidationException(ErrorCode.F005);
    }
    await this.threadRepo.softRemove(thread);
    // Counter intentionally NOT decremented — preserves history.
  }

  /**
   * Used by ForumPostService inside a transaction to update reply counters.
   * Always called from the post service; do not expose via a controller.
   */
  async incrementReplyCounters(
    threadId: Uuid,
    lastReplyUserId: Uuid,
    now: Date,
  ): Promise<void> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId } });
    if (!thread) return;
    thread.replyCount += 1;
    thread.lastReplyAt = now;
    thread.lastReplyUserId = lastReplyUserId;
    thread.hotScore = computeHotScore({
      replyCount: thread.replyCount,
      reactionCount: 0, // updated separately when reactions land in P5
      createdAt: thread.createdAt,
      now,
    });
    await this.threadRepo.save(thread);
  }

  async decrementReplyCounters(threadId: Uuid, now: Date): Promise<void> {
    const thread = await this.threadRepo.findOne({ where: { id: threadId } });
    if (!thread) return;
    thread.replyCount = Math.max(0, thread.replyCount - 1);
    if (thread.replyCount === 0) {
      thread.lastReplyAt = null;
      thread.lastReplyUserId = null;
    } else {
      // Find the new last reply (most recent non-deleted)
      // — exposed via a repo method to avoid circular deps with PostService
      const latest = await this.threadRepo.manager
        .createQueryBuilder()
        .select('post.created_at', 'created_at')
        .addSelect('post.author_id', 'author_id')
        .from('forum_post', 'post')
        .where('post.thread_id = :threadId', { threadId })
        .andWhere('post.deleted_at IS NULL')
        .orderBy('post.created_at', 'DESC')
        .limit(1)
        .getRawOne<{ created_at: Date; author_id: string }>();
      if (latest) {
        thread.lastReplyAt = latest.created_at;
        thread.lastReplyUserId = latest.author_id as Uuid;
      }
    }
    thread.hotScore = computeHotScore({
      replyCount: thread.replyCount,
      reactionCount: 0,
      createdAt: thread.createdAt,
      now,
    });
    await this.threadRepo.save(thread);
  }
}

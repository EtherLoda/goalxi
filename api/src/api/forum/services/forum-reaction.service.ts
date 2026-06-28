import { ErrorCode } from '@/constants/error-code.constant';
import { ValidationException } from '@/exceptions/validation.exception';
import {
  ForumPostEntity,
  ForumReactionEntity,
  ForumReactionType,
  Uuid,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ReactionListResDto,
  ReactionSummaryResDto,
} from '../dto/reaction.res.dto';

@Injectable()
export class ForumReactionService {
  constructor(
    @InjectRepository(ForumReactionEntity)
    private readonly reactionRepo: Repository<ForumReactionEntity>,
    @InjectRepository(ForumPostEntity)
    private readonly postRepo: Repository<ForumPostEntity>,
  ) {}

  async toggle(
    postId: Uuid,
    userId: Uuid,
    type: ForumReactionType = ForumReactionType.LIKE,
  ): Promise<ReactionSummaryResDto> {
    // Verify post exists (and is not soft-deleted — findOne default excludes)
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) {
      throw new ValidationException(ErrorCode.F003);
    }

    const existing = await this.reactionRepo.findOne({
      where: { postId, userId, type },
    });

    let hasReacted: boolean;
    if (existing) {
      await this.reactionRepo.delete({ id: existing.id });
      hasReacted = false;
    } else {
      const reaction = new ForumReactionEntity({ postId, userId, type });
      await this.reactionRepo.save(reaction);
      hasReacted = true;
    }

    const count = await this.reactionRepo.count({
      where: { postId, type },
    });
    return { count, hasReacted };
  }

  async listForPost(postId: Uuid): Promise<ReactionListResDto> {
    const reactions = await this.reactionRepo.find({
      where: { postId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    const users = reactions
      .filter((r) => r.user)
      .map((r) => ({
        id: r.user!.id,
        username: r.user!.username ?? null,
      }));
    return { users, count: reactions.length };
  }
}

import { Uuid } from '../../types/common.type';
import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { UserEntity } from '../user.entity';
import { ForumCategoryEntity } from './forum-category.entity';

@Entity('forum_thread')
@Index('IDX_forum_thread_category_pinned', [
  'categoryId',
  'isPinned',
  'lastReplyAt',
])
@Index('IDX_forum_thread_category_hot', ['categoryId', 'hotScore'])
@Index('IDX_forum_thread_author', ['authorId'])
export class ForumThreadEntity extends AbstractEntity {
  constructor(data?: Partial<ForumThreadEntity>) {
    super();
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_forum_thread_id',
  })
  id!: Uuid;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: Uuid;

  @ManyToOne(() => ForumCategoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category?: ForumCategoryEntity;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: Uuid;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author?: UserEntity;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ name: 'reply_count', type: 'int', default: 0 })
  replyCount: number;

  @Column({ name: 'last_reply_at', type: 'timestamptz', nullable: true })
  lastReplyAt: Date | null;

  @Column({ name: 'last_reply_user_id', type: 'uuid', nullable: true })
  lastReplyUserId: Uuid | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'last_reply_user_id' })
  lastReplyUser?: UserEntity;

  @Column({ name: 'hot_score', type: 'double precision', default: 0 })
  hotScore: number;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  deletedAt: Date | null;
}

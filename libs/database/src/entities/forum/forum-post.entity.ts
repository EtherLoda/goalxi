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
import { ForumThreadEntity } from './forum-thread.entity';

@Entity('forum_post')
@Index('IDX_forum_post_thread_created', ['threadId', 'createdAt'])
@Index('IDX_forum_post_author', ['authorId'])
export class ForumPostEntity extends AbstractEntity {
  constructor(data?: Partial<ForumPostEntity>) {
    super();
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_forum_post_id',
  })
  id!: Uuid;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: Uuid;

  @ManyToOne(() => ForumThreadEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'thread_id' })
  thread?: ForumThreadEntity;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: Uuid;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author?: UserEntity;

  @Column({ type: 'text' })
  body: string;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
  })
  deletedAt: Date | null;
}

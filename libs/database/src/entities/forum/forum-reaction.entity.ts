import { Uuid } from '../../types/common.type';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AbstractEntity } from '../abstract.entity';
import { UserEntity } from '../user.entity';
import { ForumPostEntity } from './forum-post.entity';
import { ForumReactionType } from './forum.enums';

@Entity('forum_reaction')
@Unique('UQ_forum_reaction_post_user_type', ['postId', 'userId', 'type'])
@Index('IDX_forum_reaction_post', ['postId'])
@Index('IDX_forum_reaction_user', ['userId'])
export class ForumReactionEntity extends AbstractEntity {
  constructor(data?: Partial<ForumReactionEntity>) {
    super();
    Object.assign(this, data);
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_forum_reaction_id',
  })
  id!: Uuid;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: Uuid;

  @ManyToOne(() => ForumPostEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post?: ForumPostEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: Uuid;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 16, default: ForumReactionType.LIKE })
  type: ForumReactionType;
}

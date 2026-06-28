import { Test, TestingModule } from '@nestjs/testing';
import {
  ReactionListResDto,
  ReactionSummaryResDto,
} from '../dto/reaction.res.dto';
import { ForumReactionService } from '../services/forum-reaction.service';
import { ForumReactionController } from './forum-reaction.controller';

describe('ForumReactionController', () => {
  let controller: ForumReactionController;
  let service: jest.Mocked<ForumReactionService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ForumReactionController],
      providers: [
        {
          provide: ForumReactionService,
          useValue: {
            toggle: jest.fn(),
            listForPost: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ForumReactionController>(ForumReactionController);
    service = module.get(ForumReactionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => expect(controller).toBeDefined());

  describe('toggle', () => {
    it('toggles reaction using requester id', async () => {
      const summary: ReactionSummaryResDto = { count: 1, hasReacted: true };
      service.toggle.mockResolvedValue(summary);
      const req = { user: { id: 'user-1' } } as any;

      const result = await controller.toggle('post-1' as any, req);
      expect(service.toggle).toHaveBeenCalledWith('post-1', 'user-1');
      expect(result.data).toEqual(summary);
    });
  });

  describe('list', () => {
    it('returns the list', async () => {
      const list: ReactionListResDto = { users: [], count: 0 };
      service.listForPost.mockResolvedValue(list);
      const result = await controller.list('post-1' as any);
      expect(result.data).toEqual(list);
    });
  });
});

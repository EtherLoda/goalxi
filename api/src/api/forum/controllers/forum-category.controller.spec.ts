import { Test, TestingModule } from '@nestjs/testing';
import { CategoryResDto } from '../dto/category.res.dto';
import { ForumCategoryService } from '../services/forum-category.service';
import { ForumCategoryController } from './forum-category.controller';

describe('ForumCategoryController', () => {
  let controller: ForumCategoryController;
  let service: jest.Mocked<ForumCategoryService>;

  const mockCategory: CategoryResDto = {
    id: 'cat-1',
    slug: 'announcements',
    name: 'Announcements',
    description: 'Official news',
    threadCount: 5,
    postCount: 20,
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ForumCategoryController],
      providers: [
        {
          provide: ForumCategoryService,
          useValue: {
            listActive: jest.fn(),
            getBySlug: jest.fn(),
            getById: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ForumCategoryController>(ForumCategoryController);
    service = module.get(ForumCategoryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('returns active categories', async () => {
      service.listActive.mockResolvedValue([mockCategory]);
      const result = await controller.list();
      expect(result).toEqual([mockCategory]);
      expect(service.listActive).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBySlug', () => {
    it('returns the category', async () => {
      service.getBySlug.mockResolvedValue(mockCategory);
      const result = await controller.getBySlug('announcements');
      expect(result).toEqual(mockCategory);
      expect(service.getBySlug).toHaveBeenCalledWith('announcements');
    });
  });
});

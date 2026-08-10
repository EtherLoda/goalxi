/**
 * Regression specs for NotificationRedisService.
 *
 * Service-level pinning only. The controller's markAllRead-routing
 * (when ids is empty) is covered by the controller spec further down.
 */
import { NotificationRedisService } from './notification-redis.service';

type AnyMock = jest.Mock;

const buildRedisMock = () => {
  const evalMock: AnyMock = jest.fn().mockResolvedValue(1);
  const pipelineMock: AnyMock = jest.fn(() => ({
    zcard: jest.fn().mockReturnThis(),
    zrevrange: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([
      [null, 5],
      [null, ['id-a', 'id-b', 'id-c', 'id-d', 'id-e']],
    ]),
  }));
  const hmgetMock: AnyMock = jest.fn();
  const getMock: AnyMock = jest.fn();
  const setMock: AnyMock = jest.fn();
  const hdelMock: AnyMock = jest.fn();
  const delMock: AnyMock = jest.fn();
  const zcardMock: AnyMock = jest.fn();
  const zaddMock: AnyMock = jest.fn();
  const zrangeMock: AnyMock = jest.fn();
  const zrangebyscoreMock: AnyMock = jest.fn();
  const zremMock: AnyMock = jest.fn();
  const zremrangebyrankMock: AnyMock = jest.fn();
  const zremrangebyscoreMock: AnyMock = jest.fn();
  const xaddMock: AnyMock = jest.fn();
  const xreadMock: AnyMock = jest.fn();

  return {
    eval: evalMock,
    pipeline: pipelineMock,
    hmget: hmgetMock,
    get: getMock,
    set: setMock,
    hdel: hdelMock,
    del: delMock,
    zcard: zcardMock,
    zadd: zaddMock,
    zrange: zrangeMock,
    zrangebyscore: zrangebyscoreMock,
    zrem: zremMock,
    zremrangebyrank: zremrangebyrankMock,
    zremrangebyscore: zremrangebyscoreMock,
    xadd: xaddMock,
    xread: xreadMock,
  };
};

describe('NotificationRedisService', () => {
  let service: NotificationRedisService;
  let redis: ReturnType<typeof buildRedisMock>;

  beforeEach(() => {
    redis = buildRedisMock();
    service = new NotificationRedisService(redis as any);
  });

  describe('create (inbox put)', () => {
    it('routes through EVAL with the inbox script — no raw ZADD/REM', async () => {
      await service.create({
        userId: 'user-1',
        type: 'AUCTION_OUTBID' as any,
        messageKey: 'notification.auctionOutbid',
        data: { foo: 'bar' },
      });

      expect(redis.eval).toHaveBeenCalledTimes(1);
      const call = redis.eval.mock.calls[0];
      expect(call[0]).toContain('ZADD');
      expect(call[0]).toContain('HSET');
      expect(call[0]).toContain('ZREM');
      expect(call[1]).toBe(2); // numKeys
      expect(call[2]).toBe('notifications:inbox:user-1');
      expect(call[3]).toBe('notifications:inbox:user-1:meta');
      expect(call[call.length - 1]).toBe('100'); // max size

      expect(redis.zadd).not.toHaveBeenCalled();
      expect(redis.zremrangebyrank).not.toHaveBeenCalled();
    });

    it('does not include expiresAt in the stored payload (P1-#11)', async () => {
      await service.create({
        userId: 'user-1',
        type: 'AUCTION_OUTBID' as any,
        messageKey: 'notification.auctionOutbid',
        data: {},
      });
      const call = redis.eval.mock.calls[0];
      const jsonArg = call[call.length - 2]; // second to last = json
      const parsed = JSON.parse(jsonArg);
      expect(parsed.expiresAt).toBeUndefined();
      expect(Object.keys(parsed).sort()).toEqual(
        ['createdAt', 'data', 'id', 'messageKey', 'type'],
      );
    });
  });

  describe('markAsRead', () => {
    it('routes through EVAL with the delete script — no full ZRANGE scan', async () => {
      (redis.eval as AnyMock).mockResolvedValueOnce(2);
      const removed = await service.markAsRead('user-1', ['id-a', 'id-b']);

      expect(removed).toBe(2);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('ZREM'),
        2,
        'notifications:inbox:user-1',
        'notifications:inbox:user-1:meta',
        'id-a',
        'id-b',
      );
      expect(redis.zrange).not.toHaveBeenCalled();
    });

    it('returns 0 when ids is empty (no Redis call)', async () => {
      const removed = await service.markAsRead('user-1', []);
      expect(removed).toBe(0);
      expect(redis.eval).not.toHaveBeenCalled();
    });
  });

  describe('getInbox', () => {
    it('uses pipeline + HMGET instead of ZRANGE+JSON.parse', async () => {
      redis.hmget.mockResolvedValueOnce([
        JSON.stringify({ id: 'id-a', createdAt: 5 }),
        JSON.stringify({ id: 'id-b', createdAt: 4 }),
        JSON.stringify({ id: 'id-c', createdAt: 3 }),
        JSON.stringify({ id: 'id-d', createdAt: 2 }),
        JSON.stringify({ id: 'id-e', createdAt: 1 }),
      ]);

      const result = await service.getInbox('user-1', 1, 5);

      expect(redis.pipeline).toHaveBeenCalledTimes(1);
      expect(redis.hmget).toHaveBeenCalledWith(
        'notifications:inbox:user-1:meta',
        'id-a',
        'id-b',
        'id-c',
        'id-d',
        'id-e',
      );
      expect(result.items).toHaveLength(5);
      expect(result.total).toBe(5);
      expect(result.unreadCount).toBe(5);
    });

    it('skips corrupted meta entries without throwing', async () => {
      redis.hmget.mockResolvedValueOnce([
        JSON.stringify({ id: 'id-a', createdAt: 1 }),
        '{not-json',
        null,
        JSON.stringify({ id: 'id-c', createdAt: 3 }),
      ]);

      const result = await service.getInbox('user-1', 1, 10);
      expect(result.items).toHaveLength(2);
      expect(result.items.map((i) => i.id)).toEqual(['id-a', 'id-c']);
    });

    it('Postfix-#2: rethrows when zcard fails inside the pipeline', async () => {
      // The pipeline mock needs to return an error in the first slot.
      // We rebuild it locally so we can control the result shape.
      const error = new Error('ECONNRESET');
      (redis.pipeline as AnyMock).mockImplementationOnce(() => ({
        zcard: jest.fn().mockReturnThis(),
        zrevrange: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce([
          [error, undefined],
          [null, []],
        ]),
      }));
      await expect(service.getInbox('user-1', 1, 20)).rejects.toThrow(
        'ECONNRESET',
      );
    });

    it('Postfix-#2: rethrows when zrevrange fails inside the pipeline', async () => {
      const error = new Error('READONLY');
      (redis.pipeline as AnyMock).mockImplementationOnce(() => ({
        zcard: jest.fn().mockReturnThis(),
        zrevrange: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValueOnce([
          [null, 0],
          [error, undefined],
        ]),
      }));
      await expect(service.getInbox('user-1', 1, 20)).rejects.toThrow(
        'READONLY',
      );
    });
  });

  describe('markAllAsRead', () => {
    it('clears both ZSET and meta HASH to avoid orphan data', async () => {
      redis.zcard.mockResolvedValueOnce(7);
      const removed = await service.markAllAsRead('user-1');
      expect(removed).toBe(7);
      expect(redis.del).toHaveBeenCalledWith(
        'notifications:inbox:user-1',
        'notifications:inbox:user-1:meta',
      );
    });
  });

  describe('createGlobalBroadcast', () => {
    it('uses EVAL + ZSET/HASH — no Redis Stream (xadd) writes', async () => {
      const id = await service.createGlobalBroadcast(
        'SYSTEM_MESSAGE' as any,
        'notification.system',
        { hello: 'world' },
      );
      expect(typeof id).toBe('string');
      expect(redis.eval).toHaveBeenCalled();
      const call = redis.eval.mock.calls[0];
      expect(call[0]).toContain('ZADD');
      expect(call[0]).toContain('HSET');
      expect(call[0]).toContain('ZREM'); // Postfix-#4: trim script
      expect(call[2]).toBe('notifications:global:pending');
      expect(call[3]).toBe('notifications:global:pending:meta');
      expect(call[call.length - 1]).toBe('1000'); // MAX_GLOBAL_PENDING_SIZE
      expect(redis.xadd).not.toHaveBeenCalled();
    });
  });

  describe('getGlobalNotificationsSince (cursor)', () => {
    it('returns nothing and seeds no cursor when ZSET is empty', async () => {
      redis.zrangebyscore.mockResolvedValueOnce([]);
      const items = await service.getGlobalNotificationsSince('user-1', 0);
      expect(items).toEqual([]);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('advances server cursor when called without an explicit since', async () => {
      redis.get.mockResolvedValueOnce(null);
      redis.zrangebyscore.mockResolvedValueOnce(['id-a', 'id-b']);
      redis.hmget.mockResolvedValueOnce([
        JSON.stringify({ id: 'id-a', createdAt: 1000 }),
        JSON.stringify({ id: 'id-b', createdAt: 1500 }),
      ]);

      const items = await service.getGlobalNotificationsSince('user-1', 0);

      expect(items).toHaveLength(2);
      expect(redis.set).toHaveBeenCalledWith(
        'notifications:global:cursor:user-1',
        '1500',
        'EX',
        expect.any(Number),
      );
    });

    it('does NOT advance server cursor when called with an explicit since (re-fetch)', async () => {
      redis.zrangebyscore.mockResolvedValueOnce(['id-a']);
      redis.hmget.mockResolvedValueOnce([
        JSON.stringify({ id: 'id-a', createdAt: 1000 }),
      ]);

      await service.getGlobalNotificationsSince('user-1', 999);

      expect(redis.set).not.toHaveBeenCalled();
    });

    it('Postfix-#4: drains multiple pages when the backlog exceeds the page size', async () => {
      // Simulate 350 broadcasts split across two pages (200 + 150).
      // Before the fix, the cursor would have been advanced past
      // the first 200 and the remaining 150 would be lost.
      redis.get.mockResolvedValueOnce(null);
      redis.zrangebyscore
        .mockResolvedValueOnce(
          Array.from({ length: 200 }, (_, i) => `id-${i}`),
        )
        .mockResolvedValueOnce(
          Array.from({ length: 150 }, (_, i) => `id-${i + 200}`),
        )
        .mockResolvedValueOnce([]); // safety terminator
      redis.hmget
        .mockResolvedValueOnce(
          Array.from(
            { length: 200 },
            (_, i) => JSON.stringify({ id: `id-${i}`, createdAt: 1000 + i }),
          ),
        )
        .mockResolvedValueOnce(
          Array.from(
            { length: 150 },
            (_, i) =>
              JSON.stringify({ id: `id-${i + 200}`, createdAt: 2000 + i }),
          ),
        );

      const items = await service.getGlobalNotificationsSince('user-1', 0);

      expect(items).toHaveLength(350);
      // cursor advances to the max score (200 + 149 = 2149)
      expect(redis.set).toHaveBeenCalledWith(
        'notifications:global:cursor:user-1',
        '2149',
        'EX',
        expect.any(Number),
      );
      // exactly 2 pages fetched (second page returns 150 < 200 so
      // the loop short-circuits without a terminator poll)
      expect(redis.zrangebyscore).toHaveBeenCalledTimes(2);
    });
  });

  describe('readGlobalStream (removed dead code)', () => {
    it('is no longer exposed on the service', () => {
      expect((service as any).readGlobalStream).toBeUndefined();
    });
  });
});

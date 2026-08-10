/**
 * P0-audit regression specs for NotificationRedisService.
 *
 * The service was refactored from a 3-step "ZADD + ZCARD + ZREMRANGEBYRANK"
 * non-atomic flow into Lua-backed "ZSET + HASH" atomic writes. These specs
 * pin the new contract:
 *   - `create` uses EVAL (not raw zadd / zcard / zremrangebyrank)
 *   - `markAsRead` uses EVAL (not raw zrange + JSON.parse)
 *   - `getGlobalNotificationsSince` advances the per-user cursor only when
 *     called without an explicit `since` (so explicit re-fetch is read-only)
 *   - `createGlobalBroadcast` no longer touches Redis Streams
 *   - `markAllAsRead` clears both the ZSET and the meta HASH
 */
import { ConfigService } from '@nestjs/config';
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

describe('NotificationRedisService (P0 audit regression)', () => {
  let service: NotificationRedisService;
  let redis: ReturnType<typeof buildRedisMock>;

  beforeEach(() => {
    redis = buildRedisMock();
    service = new NotificationRedisService(
      redis as any,
      {} as ConfigService,
    );
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
      // script reference + 2 keys + 4 args
      const call = redis.eval.mock.calls[0];
      expect(call[0]).toContain('ZADD');
      expect(call[0]).toContain('HSET');
      expect(call[0]).toContain('ZREM');
      expect(call[1]).toBe(2); // numKeys
      expect(call[2]).toBe('notifications:inbox:user-1');
      expect(call[3]).toBe('notifications:inbox:user-1:meta');
      // last arg = max size
      expect(call[call.length - 1]).toBe('100');

      expect(redis.zadd).not.toHaveBeenCalled();
      expect(redis.zremrangebyrank).not.toHaveBeenCalled();
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
      expect(call[2]).toBe('notifications:global:pending');
      expect(call[3]).toBe('notifications:global:pending:meta');
      // xadd is dead — it was the source of the broken readGlobalStream.
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
      // user has no prior cursor
      redis.get.mockResolvedValueOnce(null);
      // two pending notifications
      redis.zrangebyscore.mockResolvedValueOnce(['id-a', 'id-b']);
      redis.hmget.mockResolvedValueOnce([
        JSON.stringify({ id: 'id-a', createdAt: 1000 }),
        JSON.stringify({ id: 'id-b', createdAt: 1500 }),
      ]);

      const items = await service.getGlobalNotificationsSince('user-1', 0);

      expect(items).toHaveLength(2);
      // cursor should be advanced to the max createdAt we returned
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

      // explicit-since path = read-only on the cursor
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('readGlobalStream (removed dead code)', () => {
    it('is no longer exposed on the service', () => {
      // The method was a no-op consumer of a non-existent xread contract
      // and had zero callers. Removed in P0-#2.
      expect((service as any).readGlobalStream).toBeUndefined();
    });
  });
});

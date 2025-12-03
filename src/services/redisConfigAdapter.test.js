/**
 * Тесты не ходят в настоящий Redis.
 * Мы мокируем "@/utils/redis" и проверяем только логику адаптера.
 */

jest.mock('../utils/redis' , () => {
  return {
    __esModule: true,
    default: {
      get: jest.fn(),
      set: jest.fn()
    }
  };
});

import redis from '../utils/redis';
import { RedisConfigAdapter } from './redisConfigAdapter';

describe('RedisConfigAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new RedisConfigAdapter();
    redis.get.mockReset();
    redis.set.mockReset();
  });

  it('returns empty arrays when nothing is stored', async () => {
    redis.get.mockResolvedValueOnce(null);
    redis.get.mockResolvedValueOnce(null);
    redis.get.mockResolvedValueOnce(null);

    const users = await adapter.getUsers();
    const enterprises = await adapter.getEnterprises();
    const sellers = await adapter.getSellers();

    expect(users).toEqual([]);
    expect(enterprises).toEqual([]);
    expect(sellers).toEqual([]);
  });

  it('saves and reads users as JSON', async () => {
    const sampleUsers = [{ id: 'u1', email: 'test@example.com' }];

    await adapter.saveUsers(sampleUsers);

    expect(redis.set).toHaveBeenCalledWith(
      'config:users',
      JSON.stringify(sampleUsers)
    );

    redis.get.mockResolvedValueOnce(JSON.stringify(sampleUsers));
    const result = await adapter.getUsers();

    expect(result).toEqual(sampleUsers);
  });

  it('throws if saveUsers receives non-array', async () => {
    // @ts-ignore
    await expect(adapter.saveUsers(null)).rejects.toThrow();
  });
});


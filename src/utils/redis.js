import { createClient } from 'redis';

let redis;

const isTest = process.env.NODE_ENV === 'test';
const redisUrl = process.env.SLRP_REDIS_URL || process.env.REDIS_URL;

// В тестовой среде или при отсутствии REDIS_URL используем
// простой in‑memory stub без настоящего подключения.
if (isTest || !redisUrl) {
  if (!isTest) {
    // eslint-disable-next-line no-console
    console.warn(
      '[redis] SLRP_REDIS_URL/REDIS_URL is not set, using in-memory stub (no persistence)'
    );
  }
  redis = {
    get: async () => null,
    set: async () => {},
    del: async () => {}
  };
} else {
  if (!global._redisClient) {
    const client = createClient({
      url: redisUrl
    });

    client.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Redis Client Error', err);
    });

    // Подключение запускаем без ожидания, ошибки логируем.
    client.connect().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Redis connect error', err);
    });

    global._redisClient = client;
  }

  redis = global._redisClient;
}

export default redis;

import { RedisConfigAdapter } from './redisConfigAdapter';
import { ConfigService } from '@/domain/services/configService';

// Инициализация адаптера (Redis)
const adapter = new RedisConfigAdapter();

// Создаём доменный сервис поверх адаптера
export const configStorage = new ConfigService(adapter);


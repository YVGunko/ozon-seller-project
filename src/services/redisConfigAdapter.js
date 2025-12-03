import redis from '../utils/redis';
import { ConfigStorageAdapter } from './configStorageAdapter';

/**
 * RedisConfigAdapter
 *
 * Хранит три основных набора данных:
 *  - config:users
 *  - config:enterprises
 *  - config:sellers
 *
 * Формат — JSON-массивы.
 * Это временное, но уже безопасное решение вместо JSON-файлов.
 */
export class RedisConfigAdapter extends ConfigStorageAdapter {
  constructor() {
    super();
    this.keys = {
      users: 'config:users',
      enterprises: 'config:enterprises',
      sellers: 'config:sellers'
    };
  }

  // ----- USERS -----

  async getUsers() {
    const raw = await redis.get(this.keys.users);
    return raw ? JSON.parse(raw) : [];
  }

  async saveUsers(users) {
    if (!Array.isArray(users)) {
      throw new Error('saveUsers: users must be an array');
    }
    await redis.set(this.keys.users, JSON.stringify(users));
  }

  // ----- ENTERPRISES -----

  async getEnterprises() {
    const raw = await redis.get(this.keys.enterprises);
    return raw ? JSON.parse(raw) : [];
  }

  async saveEnterprises(enterprises) {
    if (!Array.isArray(enterprises)) {
      throw new Error('saveEnterprises: enterprises must be an array');
    }
    await redis.set(this.keys.enterprises, JSON.stringify(enterprises));
  }

  // ----- SELLERS -----

  async getSellers() {
    const raw = await redis.get(this.keys.sellers);
    return raw ? JSON.parse(raw) : [];
  }

  async saveSellers(sellers) {
    if (!Array.isArray(sellers)) {
      throw new Error('saveSellers: sellers must be an array');
    }
    await redis.set(this.keys.sellers, JSON.stringify(sellers));
  }
}


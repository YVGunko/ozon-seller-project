/**
 * ConfigService
 *
 * Доменный слой над ConfigStorageAdapter.
 * Здесь можно инкапсулировать бизнес-логику:
 *  - добавление/обновление пользователя
 *  - валидация структур
 *  - поиск по id и т.п.
 */
export class ConfigService {
  constructor(adapter) {
    this.adapter = adapter;
  }

  // ----- USERS -----

  async getUsers() {
    return this.adapter.getUsers();
  }

  async saveUsers(users) {
    return this.adapter.saveUsers(users);
  }

  async addUser(user) {
    const users = await this.adapter.getUsers();
    users.push(user);
    await this.adapter.saveUsers(users);
    return user;
  }

  async updateUser(userId, patch) {
    const users = await this.adapter.getUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;

    const updated = { ...users[idx], ...patch };
    users[idx] = updated;
    await this.adapter.saveUsers(users);
    return updated;
  }

  // ----- ENTERPRISES -----

  async getEnterprises() {
    return this.adapter.getEnterprises();
  }

  async saveEnterprises(list) {
    return this.adapter.saveEnterprises(list);
  }

  // ----- SELLERS -----

  async getSellers() {
    return this.adapter.getSellers();
  }

  async saveSellers(list) {
    return this.adapter.saveSellers(list);
  }
}


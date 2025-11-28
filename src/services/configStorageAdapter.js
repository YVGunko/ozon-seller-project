// Абстракция хранилища конфигов (users / enterprises / sellers)
// Реализация может быть на Redis, Turso, JSON-файлах и т.д.

export class ConfigStorageAdapter {
  async getUsers() {
    throw new Error('ConfigStorageAdapter.getUsers() not implemented');
  }

  async saveUsers(users) {
    throw new Error('ConfigStorageAdapter.saveUsers() not implemented');
  }

  async getEnterprises() {
    throw new Error('ConfigStorageAdapter.getEnterprises() not implemented');
  }

  async saveEnterprises(enterprises) {
    throw new Error('ConfigStorageAdapter.saveEnterprises() not implemented');
  }

  async getSellers() {
    throw new Error('ConfigStorageAdapter.getSellers() not implemented');
  }

  async saveSellers(sellers) {
    throw new Error('ConfigStorageAdapter.saveSellers() not implemented');
  }
}


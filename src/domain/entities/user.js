// src/domain/entities/user.js
//
// User — внутренний пользователь системы (сотрудник Enterprise).
// Может иметь доступ ко всем Seller организации или к ограниченному списку.

/**
 * @typedef {Object} User
 * @property {string} id                  Внутренний ID пользователя
 * @property {string} enterpriseId        ID Enterprise, которому принадлежит пользователь
 * @property {string} username            Логин пользователя (может совпадать с email, но не обязан)
 * @property {string} [email]             Email (может использоваться для уведомлений)
 * @property {string} [name]              Имя для отображения
 * @property {string[]} roles             Роли на уровне Enterprise ("admin", "manager", "content-creator" и т.п.)
 * @property {string[]} sellerIds         Список Seller, к которым есть доступ (пустой массив = все Seller Enterprise)
 * @property {Object} [preferences]       Пользовательские настройки (язык, тема и пр.)
 * @property {string} createdAt           ISO‑время создания
 * @property {string} [updatedAt]         ISO‑время последнего обновления
 */

/**
 * Создать User на основе минимального набора данных.
 *
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.enterpriseId
 * @param {string} [params.username]
 * @param {string} [params.email]
 * @param {string} [params.name]
 * @param {string[]} [params.roles]
 * @param {string[]} [params.sellerIds]
 * @param {Object} [params.preferences]
 * @param {string} [params.createdAt]
 * @param {string} [params.updatedAt]
 * @returns {User}
 */
export function createUser(params) {
  const now = new Date().toISOString();
  return {
    id: params.id,
    enterpriseId: params.enterpriseId,
    username: params.username || '',
    email: params.email || '',
    name: params.name || '',
    roles: Array.isArray(params.roles) ? params.roles : [],
    sellerIds: Array.isArray(params.sellerIds) ? params.sellerIds : [],
    preferences: params.preferences || {},
    createdAt: params.createdAt || now,
    updatedAt: params.updatedAt || now
  };
}

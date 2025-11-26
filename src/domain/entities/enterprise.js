// src/domain/entities/enterprise.js
//
// Enterprise — организация/бизнес‑клиент внутри Root.
// Объединяет несколько аккаунтов маркетплейсов (Seller) и пользователей (User).

/**
 * @typedef {Object} Enterprise
 * @property {string} id              Уникальный ID Enterprise
 * @property {string} rootId          ID Root, которому принадлежит организация
 * @property {string} name            Название компании
 * @property {string} [slug]          Машиночитаемый идентификатор (для URL / конфигов)
 * @property {Object} [settings]      Общие настройки (фичи, тариф и пр.)
 * @property {string} createdAt       ISO‑время создания
 * @property {string} [updatedAt]     ISO‑время последнего обновления
 */

/**
 * Создать Enterprise как простую структуру данных.
 *
 * @param {Object} params
 * @param {string} params.id
 * @param {string} [params.rootId]
 * @param {string} params.name
 * @param {string} [params.slug]
 * @param {Object} [params.settings]
 * @param {string} [params.createdAt]
 * @param {string} [params.updatedAt]
 * @returns {Enterprise}
 */
export function createEnterprise(params) {
  const now = new Date().toISOString();
  return {
    id: params.id,
    rootId: params.rootId || 'root',
    name: params.name,
    slug: params.slug || null,
    settings: params.settings || {},
    createdAt: params.createdAt || now,
    updatedAt: params.updatedAt || now
  };
}


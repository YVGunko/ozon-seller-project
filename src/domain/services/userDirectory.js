// src/domain/services/userDirectory.js
//
// Временный сервис для построения доменной модели User
// на основе текущего стореджa аутентификации (userStore).
// Здесь нет прямой зависимости от Next.js или конкретного хранилища —
// на вход подаются "auth users" в плоском виде.

import { createUser } from '../entities/user';

/**
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} username
 * @property {string} [name]
 * @property {string[]} [profiles]   Список доступных profileId
 * @property {string[]} [roles]      Роли пользователя (если есть)
 * @property {string[]} [sellerIds]  Явные sellerIds, если будут добавлены
 * @property {string} [email]
 */

/**
 * Построить список доменных пользователей на основе auth‑пользователей.
 *
 * @param {Object} params
 * @param {string} params.enterpriseId
 * @param {AuthUser[]} params.authUsers
 * @returns {import('../entities/user').User[]}
 */
export function mapAuthUsersToDomainUsers({ enterpriseId, authUsers }) {
  if (!enterpriseId) {
    throw new Error('mapAuthUsersToDomainUsers: enterpriseId is required');
  }

  const source = Array.isArray(authUsers) ? authUsers : [];

  return source.map((entry, index) => {
    const username = entry.username || entry.id || `user-${index + 1}`;
    const email =
      typeof entry.email === 'string' && entry.email
        ? entry.email
        : username.includes('@')
        ? username
        : '';

    const roles = Array.isArray(entry.roles) ? entry.roles : [];
    const sellerIds = Array.isArray(entry.sellerIds) ? entry.sellerIds : [];
    const allowedProfiles = Array.isArray(entry.profiles)
      ? entry.profiles.map((p) => String(p))
      : [];

    return createUser({
      id: String(entry.id || username),
      enterpriseId,
      email,
      name: entry.name || username,
      roles,
      sellerIds,
      preferences: {
        username,
        allowedProfiles
      }
    });
  });
}


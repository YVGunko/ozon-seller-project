// src/server/authContext.js
//
// Низкоуровневый контекст авторизации:
// возвращает только isAuthenticated и user, без доменной логики.

import { getServerSession } from 'next-auth/next';
import { authOptions } from './authOptions';
import { configStorage } from '../services/configStorage';

/**
 * Возвращает только:
 * - user | null
 * - isAuthenticated
 *
 * Не бросает ошибок.
 */
export async function getAuthContext(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user) {
      return {
        isAuthenticated: false,
        user: null
      };
    }

    const raw = session.user;

    const roles = Array.isArray(raw.roles) ? raw.roles : [];
    let allowedProfiles = Array.isArray(raw.allowedProfiles)
      ? raw.allowedProfiles.map((p) => String(p))
      : [];
    let enterpriseIds = Array.isArray(raw.enterpriseIds)
      ? raw.enterpriseIds.map((id) => String(id))
      : [];
    let enterpriseId =
      typeof raw.enterpriseId === 'string' && raw.enterpriseId
        ? String(raw.enterpriseId)
        : enterpriseIds[0] || null;

    // Попытка синхронизировать allowedProfiles / enterprises
    // с основным хранилищем (Redis config:users).
    try {
      const rawUsers = await configStorage.getUsers();
      if (Array.isArray(rawUsers) && rawUsers.length > 0) {
        const dbUser = rawUsers.find(
          (u) =>
            String(u.id || u.username) === String(raw.id || raw.email)
        );
        if (dbUser) {
          if (Array.isArray(dbUser.profiles)) {
            allowedProfiles = dbUser.profiles.map((p) => String(p));
          }
          const dbEnterpriseIds = Array.isArray(dbUser.enterprises)
            ? dbUser.enterprises.map((id) => String(id))
            : [];
          if (dbEnterpriseIds.length > 0) {
            enterpriseIds = dbEnterpriseIds;
            enterpriseId =
              typeof dbUser.enterpriseId === 'string' && dbUser.enterpriseId
                ? String(dbUser.enterpriseId)
                : dbEnterpriseIds[0];
          }
        }
      }
    } catch (syncError) {
      // eslint-disable-next-line no-console
      console.error(
        '[getAuthContext] failed to sync user from configStorage',
        syncError
      );
    }

    return {
      isAuthenticated: true,
      user: {
        id: raw.id || raw.email,
        email: raw.email || null,
        username: raw.username || raw.email,
        name: raw.name || null,
        roles,
        allowedProfiles,
        enterpriseIds,
        enterpriseId
      }
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[getAuthContext] auth error', err);
    return {
      isAuthenticated: false,
      user: null
    };
  }
}

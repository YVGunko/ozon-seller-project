// src/server/authContext.js
//
// Низкоуровневый контекст авторизации:
// возвращает только isAuthenticated и user, без доменной логики.

import { getServerSession } from 'next-auth/next';
import { authOptions } from './authOptions';

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
    const allowedProfiles = Array.isArray(raw.allowedProfiles)
      ? raw.allowedProfiles.map((p) => String(p))
      : [];
    const enterpriseIds = Array.isArray(raw.enterpriseIds)
      ? raw.enterpriseIds.map((id) => String(id))
      : [];
    const enterpriseId =
      typeof raw.enterpriseId === 'string' && raw.enterpriseId
        ? raw.enterpriseId
        : enterpriseIds[0] || null;

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

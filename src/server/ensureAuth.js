// src/server/ensureAuth.js
//
// Обёртка над getAuthContext для строгого режима (requireAuth).

import { getAuthContext } from './authContext';

/**
 * ensureAuth(req, res)
 *
 * Бросает 401, если пользователь не авторизован.
 * В остальном возвращает тот же объект, что и getAuthContext:
 * { isAuthenticated, user }.
 */
export async function ensureAuth(req, res) {
  // Пытаемся получить контекст авторизации.
  // Любая ошибка трактуется как отсутствие авторизации.
  let ctx;
  try {
    ctx = await getAuthContext(req, res);
  } catch (e) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  if (!ctx.isAuthenticated) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  return ctx;
}


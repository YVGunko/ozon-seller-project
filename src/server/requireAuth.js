// src/server/requireAuth.js
//
// Обёртка над getAuthContext: бросает 401, если пользователь не авторизован.

import { getAuthContext } from './authContext';

export async function requireAuth(req, res) {
  const ctx = await getAuthContext(req, res);

  if (!ctx.isAuthenticated) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }

  return ctx;
}


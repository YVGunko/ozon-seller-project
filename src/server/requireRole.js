// src/server/requireRole.js
//
// Обёртка над requireAuth: дополнительно проверяет наличие роли.

import { requireAuth } from './requireAuth';

export async function requireRole(req, res, role) {
  const ctx = await requireAuth(req, res);

  const roles = Array.isArray(ctx.user?.roles) ? ctx.user.roles : [];
  if (!roles.includes(role)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  return ctx;
}


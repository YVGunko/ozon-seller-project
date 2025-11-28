// pages/api/admin/users.js
//
// Admin‑эндпоинт для управления внутренними пользователями Enterprise.
// Пока источник данных — config/users.json в Blob (синхронизация с userStore).
//
// Поддерживает:
//   GET  /api/admin/users   — список пользователей (без паролей)
//   POST /api/admin/users   — создать или обновить пользователя

import { list, put } from '@vercel/blob';
import { withServerContext } from '../../../src/server/apiUtils';
import {
  getAuthUsers,
  reloadAuthUsersFromBlob
} from '../../../src/server/userStore';
import {
  canManageUsers,
  isRootAdmin
} from '../../../src/domain/services/accessControl';

const { CONFIG_USERS_BLOB_PREFIX } = process.env;
const USERS_BLOB_PREFIX = CONFIG_USERS_BLOB_PREFIX || 'config/users.json';

async function loadUsersConfig() {
  const { blobs } = await list({ prefix: USERS_BLOB_PREFIX });
  if (!blobs || blobs.length === 0) {
    // Конфига ещё нет — возвращаем пустой массив и путь по умолчанию.
    return { users: [], pathname: USERS_BLOB_PREFIX };
  }
  const blob = blobs[0];
  const downloadUrl = blob.downloadUrl || blob.url;
  const res = await fetch(downloadUrl);
  const text = await res.text();
  const json = text ? JSON.parse(text) : [];
  return {
    users: Array.isArray(json) ? json : [],
    pathname: blob.pathname
  };
}

async function saveUsersConfig(pathname, users) {
  const json = JSON.stringify(users, null, 2);
  await put(pathname, json, {
    access: 'public',
    contentType: 'application/json'
  });
}

async function handler(req, res, ctx) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { auth, domain } = ctx;
  const currentUser = auth.user;

  if (!currentUser) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!canManageUsers(currentUser)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'GET') {
    const enterpriseId = domain.activeEnterprise?.id || 'ent-legacy';
    const authUsers = await getAuthUsers();

    const items = (Array.isArray(authUsers) ? authUsers : []).map((entry) => ({
      id: String(entry.id || entry.username),
      enterpriseId,
      name: entry.name || entry.username,
      email: entry.email || '',
      roles: Array.isArray(entry.roles) ? entry.roles : [],
      username: entry.username || '',
      profiles: Array.isArray(entry.profiles)
        ? entry.profiles.map((p) => String(p))
        : [],
      hasPassword: Boolean(entry.password)
    }));

    return res.status(200).json({ items });
  }

  // POST: создать или обновить пользователя.
  const {
    id,
    username,
    name,
    email,
    password,
    roles: incomingRoles,
    profiles: incomingProfiles
  } = req.body || {};

  if (!username) {
    return res.status(400).json({ error: 'username обязателен' });
  }

  // Ограничения для ролей: manager не может назначать admin/root_admin.
  const roles = Array.isArray(incomingRoles)
    ? incomingRoles.map((r) => String(r)).filter(Boolean)
    : [];

  if (!isRootAdmin(currentUser)) {
    const forbiddenRoles = ['admin', 'root_admin'];
    if (roles.some((r) => forbiddenRoles.includes(r))) {
      return res.status(403).json({
        error:
          'Назначать роль admin/root_admin может только администратор платформы'
      });
    }
  }

  const managerAllowedProfiles =
    currentUser.allowedProfiles?.map((p) => String(p)) || [];

  const profiles = Array.isArray(incomingProfiles)
    ? incomingProfiles.map((p) => String(p)).filter(Boolean)
    : [];

  if (!isRootAdmin(currentUser) && profiles.length > 0 && managerAllowedProfiles.length > 0) {
    // Менеджер может выдавать доступ только к тем профилям, к которым имеет доступ сам.
    const allowedSet = new Set(managerAllowedProfiles);
    const notAllowed = profiles.filter((p) => !allowedSet.has(p));
    if (notAllowed.length > 0) {
      return res.status(403).json({
        error: 'Вы не можете назначать профили, к которым у вас нет доступа',
        details: { notAllowed }
      });
    }
  }

  const { users: rawUsers, pathname } = await loadUsersConfig();
  const users = Array.isArray(rawUsers) ? [...rawUsers] : [];

  const userId = id ? String(id) : String(username);
  const existingIndex = users.findIndex(
    (u) => String(u.id || u.username) === userId
  );
  const base = existingIndex >= 0 ? users[existingIndex] : {};

  let nextPassword = base.password;
  if (typeof password === 'string') {
    const trimmed = password.trim();
    if (trimmed) {
      nextPassword = trimmed;
    }
  }

  if (!nextPassword) {
    // Для нового пользователя пароль обязателен.
    return res
      .status(400)
      .json({ error: 'password обязателен для нового пользователя' });
  }

  const updatedUser = {
    ...base,
    id: userId,
    username,
    password: nextPassword,
    name: name || base.name || username,
    email: email || base.email || (username.includes('@') ? username : ''),
    profiles: profiles.length > 0 ? profiles : base.profiles || [],
    roles: roles.length > 0 ? roles : base.roles || []
  };

  if (existingIndex >= 0) {
    users[existingIndex] = updatedUser;
  } else {
    users.push(updatedUser);
  }

  await saveUsersConfig(pathname, users);
  await reloadAuthUsersFromBlob();

  return res.status(200).json({
    user: {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email || '',
      roles: updatedUser.roles || [],
      username: updatedUser.username || '',
      profiles: Array.isArray(updatedUser.profiles)
        ? updatedUser.profiles
        : [],
      hasPassword: Boolean(updatedUser.password)
    }
  });
}

export default withServerContext(handler, { requireAuth: true });

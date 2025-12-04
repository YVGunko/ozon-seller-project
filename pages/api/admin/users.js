// pages/api/admin/users.js
//
// Admin‑эндпоинт для управления внутренними пользователями Enterprise.
// Пока источник данных — config/users.json в Blob (синхронизация с userStore).
//
// Поддерживает:
//   GET  /api/admin/users   — список пользователей (без паролей)
//   POST /api/admin/users   — создать или обновить пользователя

import { withServerContext } from '../../../src/server/apiUtils';
import {
  getAuthUsers,
  reloadAuthUsersFromBlob
} from '../../../src/server/userStore';
import {
  canManageUsers,
  isRootAdmin
} from '../../../src/domain/services/accessControl';
import { configStorage } from '../../../src/services/configStorage';

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{8,32}$/;

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
    // Загружаем пользователей из основного хранилища (Redis / configStorage),
    // чтобы иметь доступ к enterprises/profiles и фильтровать по Enterprise.
    let users = [];
    try {
      const rawUsers = await configStorage.getUsers();
      if (Array.isArray(rawUsers)) {
        users = rawUsers;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[admin/users] failed to read users from configStorage', e);
      users = [];
    }

    // Для обратной совместимости: если в Redis ещё пусто, используем userStore.
    if (users.length === 0) {
      const authUsers = await getAuthUsers();
      users = Array.isArray(authUsers) ? [...authUsers] : [];
    }

    const isRoot = isRootAdmin(currentUser);

    // Enterprise текущего пользователя для фильтрации (manager).
    let currentEnterpriseIds = [];
    if (!isRoot) {
      const dbCurrent = users.find(
        (u) => String(u.id || u.username) === String(currentUser.id)
      );
      if (dbCurrent && Array.isArray(dbCurrent.enterprises)) {
        currentEnterpriseIds = dbCurrent.enterprises.map((id) => String(id));
      }
    }

    let visibleUsers = users;

    if (!isRoot) {
      // Менеджер видит только пользователей внутри своих Enterprise.
      const currentSet = new Set(currentEnterpriseIds);
      visibleUsers = users.filter((entry) => {
        const entryEnterpriseIds = Array.isArray(entry.enterprises)
          ? entry.enterprises.map((id) => String(id))
          : [];

        // root/admin‑пользователи с enterprises: [] менеджеру не показываем.
        const entryIsRoot =
          Array.isArray(entry.roles) &&
          entry.roles.some((role) => ['admin', 'root_admin'].includes(role));
        if (entryIsRoot) return false;

        if (currentSet.size === 0 || entryEnterpriseIds.length === 0) {
          return false;
        }

        return entryEnterpriseIds.some((id) => currentSet.has(id));
      });
    }

    const items = visibleUsers.map((entry) => {
      const enterpriseIds = Array.isArray(entry.enterprises)
        ? entry.enterprises.map((id) => String(id))
        : [];
      const enterpriseId =
        enterpriseIds.length > 0
          ? enterpriseIds[0]
          : domain.activeEnterprise?.id || 'ent-legacy';

      return {
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
      };
    });

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

  const normalizedUsername =
    typeof username === 'string' ? username.trim() : '';

  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return res.status(400).json({
      error:
        'username должен содержать от 8 до 32 символов (латиница, цифры, ".", "_" или "-")'
    });
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

  // Загружаем текущую конфигурацию пользователей из configStorage.
  let users = [];
  try {
    const rawUsers = await configStorage.getUsers();
    if (Array.isArray(rawUsers)) {
      users = [...rawUsers];
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[admin/users] failed to read users from configStorage', e);
    users = [];
  }

  // Если хранилище пока пустое (первый запуск), инициализируем его
  // через userStore (env / Blob) и повторно читаем.
  if (users.length === 0) {
    const authUsers = await getAuthUsers();
    users = Array.isArray(authUsers) ? [...authUsers] : [];
  }

  const userId = id ? String(id) : String(normalizedUsername);
  const existingIndex = users.findIndex(
    (u) => String(u.id || u.username) === userId
  );
  const base = existingIndex >= 0 ? users[existingIndex] : {};

  const isRoot = isRootAdmin(currentUser);

  // Enterprise‑ограничения:
  //  - root/admin может управлять любыми пользователями;
  //  - manager — только пользователями своего Enterprise.
  let currentEnterpriseIds = [];
  if (!isRoot) {
    const dbCurrent = users.find(
      (u) => String(u.id || u.username) === String(currentUser.id)
    );
    if (dbCurrent && Array.isArray(dbCurrent.enterprises)) {
      currentEnterpriseIds = dbCurrent.enterprises.map((eid) => String(eid));
    }
  }

  const targetEnterpriseIds = Array.isArray(base.enterprises)
    ? base.enterprises.map((eid) => String(eid))
    : [];

  if (!isRoot) {
    // Менеджер не может редактировать root/admin‑пользователей.
    const targetIsRoot =
      Array.isArray(base.roles) &&
      base.roles.some((role) => ['admin', 'root_admin'].includes(role));
    if (targetIsRoot) {
      return res.status(403).json({
        error: 'Вы не можете изменять пользователей с ролью admin/root_admin'
      });
    }

    // И не может редактировать пользователей из других Enterprise.
    const currentSet = new Set(currentEnterpriseIds);
    if (
      targetEnterpriseIds.length > 0 &&
      currentSet.size > 0 &&
      !targetEnterpriseIds.some((eid) => currentSet.has(eid))
    ) {
      return res.status(403).json({
        error: 'Вы не можете изменять пользователей других организаций'
      });
    }
  }

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
    username: normalizedUsername,
    password: nextPassword,
    name: name || base.name || username,
    email: email || base.email || (username.includes('@') ? username : ''),
    // enterprises:
    //  - для root/admin оставляем как есть или позволяем задать руками (через Redis / отдельные инструменты);
    //  - для manager при создании пользователя (base.enterprises пустой) автоматически
    //    привязываем к тем же Enterprise, что и у него самого.
    enterprises:
      isRoot || Array.isArray(base.enterprises)
        ? base.enterprises || []
        : currentEnterpriseIds,
    profiles: profiles.length > 0 ? profiles : base.profiles || [],
    roles: roles.length > 0 ? roles : base.roles || []
  };

  if (existingIndex >= 0) {
    users[existingIndex] = updatedUser;
  } else {
    users.push(updatedUser);
  }

  try {
    await configStorage.saveUsers(users);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[admin/users] failed to save users to configStorage', e);
    return res
      .status(500)
      .json({ error: 'Не удалось сохранить конфигурацию пользователей' });
  }
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

// pages/api/admin/enterprises.js
//
// Admin эндпоинт для Enterprise:
//   GET    — список Enterprise (read‑only)
//   POST   — создать Enterprise
//   PATCH  — частично обновить Enterprise по id

import { withServerContext } from '../../../src/server/apiUtils';
import {
  reloadEnterprisesFromBlob
} from '../../../src/server/enterpriseStore';
import {
  canManageEnterprises,
  canViewEnterprises
} from '../../../src/domain/services/accessControl';
import { configStorage } from '../../../src/services/configStorage';

function normalizeEnterpriseInput(input = {}) {
  const id = input.id ? String(input.id) : null;
  const name = typeof input.name === 'string' && input.name.trim()
    ? input.name.trim()
    : null;
  const slug = typeof input.slug === 'string' && input.slug.trim()
    ? input.slug.trim()
    : null;
  const settings = input.settings && typeof input.settings === 'object'
    ? input.settings
    : {};
  const profileIds = Array.isArray(input.profileIds)
    ? input.profileIds.map((p) => String(p))
    : undefined; // undefined = не менять, [] = очистить

  return { id, name, slug, settings, profileIds };
}

async function handleGet(req, res, user) {
  if (!canViewEnterprises(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Единый источник правды — Redis через configStorage
  const list = await configStorage.getEnterprises();
  const all = Array.isArray(list) ? list : [];

  let visible = all;
  if (!canManageEnterprises(user)) {
    // manager — только Enterprise, связанные с его профилями
    const allowedProfiles = Array.isArray(user.allowedProfiles)
      ? user.allowedProfiles.map(String)
      : [];
    if (allowedProfiles.length > 0) {
      const allowedSet = new Set(allowedProfiles);
      visible = all.filter((ent) =>
        Array.isArray(ent.profileIds)
          ? ent.profileIds.map(String).some((pid) => allowedSet.has(pid))
          : false
      );
    } else {
      visible = [];
    }
  }

  const items = visible.map((ent) => ({
    id: String(ent.id),
    name: ent.name || String(ent.id),
    slug: ent.slug || null,
    settings: ent.settings || {}
  }));

  return res.status(200).json({ items });
}

async function handlePost(req, res, user) {
  if (!canManageEnterprises(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { id, name, slug, settings, profileIds } = normalizeEnterpriseInput(req.body);

  if (!name) {
    return res.status(400).json({ error: 'name обязателен' });
  }

  // Загружаем текущий список из Redis через configStorage
  const list = await configStorage.getEnterprises();
  const enterprises = Array.isArray(list) ? [...list] : [];

  // Уникальность id/slug
  const newId = id || `ent-${Date.now()}`;
  if (enterprises.some((e) => String(e.id) === newId)) {
    return res.status(409).json({ error: 'Enterprise с таким id уже существует' });
  }
  if (slug && enterprises.some((e) => String(e.slug) === slug)) {
    return res.status(409).json({ error: 'Enterprise с таким slug уже существует' });
  }

  const next = {
    id: newId,
    name,
    slug: slug || null,
    settings: settings || {},
    profileIds: Array.isArray(profileIds) ? profileIds : []
  };

  enterprises.push(next);
  await configStorage.saveEnterprises(enterprises);
  // Перезагрузим кэш enterpriseStore (который читает из Blob/файлов)
  // На данном этапе enterpriseStore остаётся совместимостью для чтения.
  await reloadEnterprisesFromBlob();

  return res.status(201).json({ enterprise: next });
}

async function handlePatch(req, res, user) {
  if (!canManageEnterprises(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { id, name, slug, settings, profileIds } = normalizeEnterpriseInput(req.body);
  const targetId = id || String(req.query.id || req.body?.enterpriseId || '');
  if (!targetId) {
    return res.status(400).json({ error: 'id обязателен для PATCH' });
  }

  const list = await configStorage.getEnterprises();
  const enterprises = Array.isArray(list) ? [...list] : [];
  const idx = enterprises.findIndex((e) => String(e.id) === String(targetId));
  if (idx === -1) {
    return res.status(404).json({ error: 'Enterprise не найден' });
  }

  // Проверка уникальности slug при изменении
  if (slug && enterprises.some((e, i) => i !== idx && String(e.slug) === slug)) {
    return res.status(409).json({ error: 'Enterprise с таким slug уже существует' });
  }

  const base = enterprises[idx];
  const updated = {
    ...base,
    ...(name ? { name } : {}),
    ...(slug !== null ? { slug } : {}),
    ...(settings ? { settings } : {}),
    ...(profileIds !== undefined ? { profileIds } : {})
  };

  enterprises[idx] = updated;
  await configStorage.saveEnterprises(enterprises);
  await reloadEnterprisesFromBlob();

  return res.status(200).json({ enterprise: updated });
}

async function handler(req, res, ctx) {
  const { auth } = ctx;
  const user = auth.user;

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, user);
  }
  if (req.method === 'POST') {
    return handlePost(req, res, user);
  }
  if (req.method === 'PATCH') {
    return handlePatch(req, res, user);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withServerContext(handler, { requireAuth: true });

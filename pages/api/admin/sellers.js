// pages/api/admin/sellers.js
//
// Админ-эндпоинт для управления Seller-подобными сущностями,
// которые сейчас хранятся в config/profiles.json и привязаны
// к Enterprise через config/enterprises.json.
//
// Поддерживает:
//   GET  /api/admin/sellers      — список продавцов с привязкой к Enterprise
//   POST /api/admin/sellers      — создать или обновить продавца

import { list, put } from '@vercel/blob';
import { withServerContext } from '../../../src/server/apiUtils';
import {
  canManageEnterprises,
  canManageSellers
} from '../../../src/domain/services/accessControl';
import {
  reloadProfilesFromBlob,
  ensureProfilesLoaded,
  getProfilesForUser
} from '../../../src/server/profileStore';
import {
  reloadEnterprisesFromBlob,
  getEnterpriseById
} from '../../../src/server/enterpriseStore';

const { CONFIG_PROFILES_BLOB_PREFIX, CONFIG_ENTERPRISES_BLOB_PREFIX } = process.env;

const PROFILES_BLOB_PREFIX = CONFIG_PROFILES_BLOB_PREFIX || 'config/profiles.json';
const ENTERPRISES_BLOB_PREFIX =
  CONFIG_ENTERPRISES_BLOB_PREFIX || 'config/enterprises.json';

async function loadJsonConfig(prefix) {
  const { blobs } = await list({ prefix });
  if (!blobs || blobs.length === 0) {
    return { data: [], pathname: prefix };
  }
  const blob = blobs[0];
  const downloadUrl = blob.downloadUrl || blob.url;
  const res = await fetch(downloadUrl);
  const text = await res.text();
  const json = JSON.parse(text || '[]');
  return { data: Array.isArray(json) ? json : [], pathname: blob.pathname };
}

async function saveJsonConfig(pathname, data) {
  const json = JSON.stringify(data, null, 2);
  await put(pathname, json, {
    access: 'public',
    contentType: 'application/json'
  });
}

async function handler(req, res, ctx) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { auth } = ctx;
  const user = auth.user;

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isRoot = canManageEnterprises(user);

  if (req.method === 'GET') {
    const allowedProfiles = Array.isArray(user.allowedProfiles)
      ? user.allowedProfiles
      : [];

    const { data: rawEnterprises } = await loadJsonConfig(ENTERPRISES_BLOB_PREFIX);
    let enterpriseConfigs = Array.isArray(rawEnterprises) ? rawEnterprises : [];

    if (!isRoot) {
      // Менеджер видит только Enterprise, связанные с его профилями
      const allowedSet = new Set(allowedProfiles.map(String));
      enterpriseConfigs = enterpriseConfigs.filter((ent) =>
        Array.isArray(ent.profileIds)
          ? ent.profileIds.some((pid) => allowedSet.has(String(pid)))
          : false
      );
    }

    const profiles = isRoot
      ? await ensureProfilesLoaded()
      : getProfilesForUser(allowedProfiles);

    // Строим мапу profileId -> enterpriseId (по первому попаданию среди доступных enterprise)
    const profileToEnterprise = {};
    for (const ent of enterpriseConfigs) {
      const profileIds = Array.isArray(ent.profileIds) ? ent.profileIds : [];
      profileIds.forEach((pid) => {
        const id = String(pid);
        if (!profileToEnterprise[id]) {
          profileToEnterprise[id] = ent.id;
        }
      });
    }

    const items = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      ozon_client_id: p.ozon_client_id,
      ozon_has_api_key: Boolean(p.ozon_api_key),
      client_hint: p.client_hint,
      description: p.description || '',
      enterpriseId: profileToEnterprise[p.id] || null
    }));

    return res.status(200).json({ items });
  }

  // POST: создать или обновить продавца
  const {
    id,
    name,
    ozon_client_id,
    ozon_api_key,
    client_hint,
    description,
    enterpriseId
  } = req.body || {};

  const targetEnterprise = enterpriseId
    ? await getEnterpriseById(String(enterpriseId))
    : null;

  if (enterpriseId && !targetEnterprise) {
    return res.status(400).json({ error: 'Указанный enterpriseId не найден' });
  }

  // Если указана организация, проверяем, что пользователь может управлять Seller в её рамках.
  if (targetEnterprise && !canManageSellers(user, targetEnterprise)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { data: rawProfiles, pathname: profilesPath } = await loadJsonConfig(
    PROFILES_BLOB_PREFIX
  );
  const { data: rawEnterprises, pathname: enterprisesPath } = await loadJsonConfig(
    ENTERPRISES_BLOB_PREFIX
  );

  let profiles = Array.isArray(rawProfiles) ? [...rawProfiles] : [];
  let enterprises = Array.isArray(rawEnterprises) ? [...rawEnterprises] : [];

  const profileId = id ? String(id) : String(ozon_client_id);

  // Для нового Seller ozon_client_id и ozon_api_key обязательны.
  // Для существующего — можно не передавать ozon_api_key, тогда он не изменяется.
  if (!profileId || !ozon_client_id) {
    return res
      .status(400)
      .json({ error: 'ozon_client_id обязателен для продавца' });
  }

  // Обновляем или создаём профиль
  const existingIndex = profiles.findIndex((p) => String(p.id) === profileId);
  const baseProfile = existingIndex >= 0 ? profiles[existingIndex] : {};

  const nextApiKey =
    typeof ozon_api_key === 'string' && ozon_api_key.trim().length > 0
      ? ozon_api_key.trim()
      : baseProfile.ozon_api_key;

  if (!nextApiKey) {
    // Нет старого ключа и не передан новый — это создание/редактирование без ключа.
    return res
      .status(400)
      .json({ error: 'ozon_api_key обязателен для нового продавца' });
  }

  const updatedProfile = {
    ...baseProfile,
    id: profileId,
    name: name || baseProfile.name || `Seller ${profileId}`,
    ozon_client_id,
    ozon_api_key: nextApiKey,
    client_hint:
      client_hint ||
      baseProfile.client_hint ||
      String(ozon_client_id).slice(0, 8),
    description: description || baseProfile.description || ''
  };

  if (existingIndex >= 0) {
    profiles[existingIndex] = updatedProfile;
  } else {
    profiles.push(updatedProfile);
  }

  // Обновляем привязку к Enterprise через profileIds
  if (enterpriseId) {
    const entId = String(enterpriseId);

    enterprises = enterprises.map((ent) => {
      const profileIds = Array.isArray(ent.profileIds) ? [...ent.profileIds] : [];
      const hasId = profileIds.map(String).includes(profileId);

      if (ent.id === entId) {
        if (!hasId) profileIds.push(profileId);
        return {
          ...ent,
          profileIds
        };
      }

      // Удаляем профиль из других enterprise, если он там был
      if (hasId) {
        return {
          ...ent,
          profileIds: profileIds.filter((pid) => String(pid) !== profileId)
        };
      }

      return ent;
    });
  }

  await saveJsonConfig(profilesPath, profiles);
  await saveJsonConfig(enterprisesPath, enterprises);

  // Обновляем кэши
  await reloadProfilesFromBlob();
  await reloadEnterprisesFromBlob();

  return res.status(200).json({
    seller: {
      id: profileId,
      name: updatedProfile.name,
      ozon_client_id: updatedProfile.ozon_client_id,
      client_hint: updatedProfile.client_hint,
      description: updatedProfile.description,
      enterpriseId: enterpriseId || null
    }
  });
}

export default withServerContext(handler, { requireAuth: true });

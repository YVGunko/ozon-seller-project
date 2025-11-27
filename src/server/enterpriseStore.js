// src/server/enterpriseStore.js
//
// Хранилище Enterprise, основанное на JSON‑конфиге в Vercel Blob:
//   config/enterprises.json
//
// Структура файла:
// [
//   {
//     "id": "ent-main",
//     "name": "Nakito / LED AUTO",
//     "slug": "nakito-led-auto",
//     "profileIds": ["76251", "3497256"],
//     "settings": {
//       "ai": { "textEnabled": true, "imageEnabled": true }
//     }
//   }
// ]

import { list } from '@vercel/blob';
import { createEnterprise } from '../domain/entities/enterprise';

const { CONFIG_ENTERPRISES_BLOB_PREFIX } = process.env;
const ENTERPRISES_BLOB_PREFIX = CONFIG_ENTERPRISES_BLOB_PREFIX || 'config/enterprises.json';

/**
 * Внутренний кэш: массив объектов { enterprise, profileIds[] }.
 * profileIds используются только для поиска Enterprise по OZON‑профилю.
 * @type {{ enterprise: import('../domain/entities/enterprise').Enterprise, profileIds: string[] }[]|null}
 */
let cachedEntries = null;

function normalizeEnterpriseEntries(raw = []) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;

      const id = String(entry.id || `ent-${index + 1}`);
      const name = entry.name || id;
      const slug = entry.slug || null;
      const settings = entry.settings || {};
      const profileIds = Array.isArray(entry.profileIds)
        ? entry.profileIds.map((p) => String(p))
        : [];

      const enterprise = createEnterprise({
        id,
        rootId: entry.rootId || 'root',
        name,
        slug,
        settings
      });

      return { enterprise, profileIds };
    })
    .filter(Boolean);
}

async function loadEnterprisesFromBlob() {
  try {
    const { blobs } = await list({ prefix: ENTERPRISES_BLOB_PREFIX });
    if (!blobs || blobs.length === 0) {
      // eslint-disable-next-line no-console
      console.log(
        '[enterpriseStore] no enterprises config blob found, prefix =',
        ENTERPRISES_BLOB_PREFIX
      );
      return null;
    }

    const blob = blobs[0];
    const downloadUrl = blob.downloadUrl || blob.url;
    const res = await fetch(downloadUrl);
    const text = await res.text();
    const json = JSON.parse(text);

    if (!Array.isArray(json)) {
      // eslint-disable-next-line no-console
      console.error(
        '[enterpriseStore] enterprises config blob is not an array, pathname =',
        blob.pathname
      );
      return null;
    }

    const entries = normalizeEnterpriseEntries(json);

    // eslint-disable-next-line no-console
    console.log(
      '[enterpriseStore] loaded enterprises from Blob',
      JSON.stringify({ count: entries.length, pathname: blob.pathname })
    );

    return entries;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[enterpriseStore] failed to load enterprises from Blob', error);
    return null;
  }
}

async function ensureEnterprisesLoaded() {
  if (cachedEntries) return cachedEntries;
  const fromBlob = await loadEnterprisesFromBlob();
  cachedEntries = fromBlob || [];
  return cachedEntries;
}

/**
 * Получить все Enterprise (без привязки к профилям).
 * @returns {Promise<import('../domain/entities/enterprise').Enterprise[]>}
 */
export async function getAllEnterprises() {
  const entries = await ensureEnterprisesLoaded();
  return entries.map((e) => e.enterprise);
}

/**
 * Найти Enterprise по OZON profileId (если настроен в конфиге).
 * Если ничего не найдено — возвращает null, и вызывающий код может
 * использовать fallback (`ent-<profileId>`), как сейчас.
 *
 * @param {string} profileId
 * @returns {Promise<import('../domain/entities/enterprise').Enterprise|null>}
 */
export async function findEnterpriseByProfileId(profileId) {
  if (!profileId) return null;
  const entries = await ensureEnterprisesLoaded();
  const pid = String(profileId);
  const found = entries.find((e) => e.profileIds.includes(pid));
  return found ? found.enterprise : null;
}

/**
 * Получить список Enterprise, к которым привязаны указанные profileId.
 * Используется для ограничения видимости Enterprise для менеджеров.
 *
 * @param {string[]} profileIds
 * @returns {Promise<import('../domain/entities/enterprise').Enterprise[]>}
 */
export async function getEnterprisesForProfileIds(profileIds) {
  const ids = Array.isArray(profileIds) ? profileIds.map((p) => String(p)) : [];
  if (!ids.length) return [];
  const entries = await ensureEnterprisesLoaded();
  const idSet = new Set(ids);
  const seen = new Set();
  const result = [];

  for (const entry of entries) {
    if (entry.profileIds.some((pid) => idSet.has(pid))) {
      if (!seen.has(entry.enterprise.id)) {
        seen.add(entry.enterprise.id);
        result.push(entry.enterprise);
      }
    }
  }

  return result;
}


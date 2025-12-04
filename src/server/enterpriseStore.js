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
 * Внутренний кэш Enterprise.
 * @type {import('../domain/entities/enterprise').Enterprise[]|null}
 */
let cachedEnterprises = null;

function normalizeEnterpriseEntries(raw = []) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;

      const id = String(entry.id || `ent-${index + 1}`);
      const name = entry.name || id;
      const slug = entry.slug || null;
      const settings = entry.settings || {};
      const enterprise = createEnterprise({
        id,
        rootId: entry.rootId || 'root',
        name,
        slug,
        settings
      });

      return enterprise;
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

    const enterprises = normalizeEnterpriseEntries(json);

    // eslint-disable-next-line no-console
    console.log(
      '[enterpriseStore] loaded enterprises from Blob',
      JSON.stringify({ count: enterprises.length, pathname: blob.pathname })
    );

    return enterprises;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[enterpriseStore] failed to load enterprises from Blob', error);
    return null;
  }
}

async function ensureEnterprisesLoaded() {
  if (cachedEnterprises) return cachedEnterprises;
  const fromBlob = await loadEnterprisesFromBlob();
  cachedEnterprises = fromBlob || [];
  return cachedEnterprises;
}

/**
 * Получить все Enterprise (без привязки к профилям).
 * @returns {Promise<import('../domain/entities/enterprise').Enterprise[]>}
 */
export async function getAllEnterprises() {
  const enterprises = await ensureEnterprisesLoaded();
  return enterprises;
}

/**
 * Найти Enterprise по id.
 * @param {string} id
 * @returns {Promise<import('../domain/entities/enterprise').Enterprise|null>}
 */
export async function getEnterpriseById(id) {
  if (!id) return null;
  const enterprises = await ensureEnterprisesLoaded();
  const found = enterprises.find((e) => e.id === id);
  return found || null;
}

// Принудительно перезагрузить Enterprise-конфиг из Blob.
// Используется админскими API после изменения config/enterprises.json.
export async function reloadEnterprisesFromBlob() {
  cachedEnterprises = null;
  return ensureEnterprisesLoaded();
}

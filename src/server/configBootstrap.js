// src/server/configBootstrap.js
//
// Инициализация configStorage данными из существующих JSON‑конфигов.
// Используется как миграционный слой: при первом обращении
// заполняем Redis (config:enterprises / config:sellers) на основе
// enterpriseStore + profileStore.

import { configStorage } from '../services/configStorage';
import { getAllEnterprises } from './enterpriseStore';
import {
  ensureProfilesLoaded,
  getAllProfiles
} from './profileStore';

let bootstrapDone = false;

/**
 * ensureEnterprisesAndSellersSeeded
 *
 * 1) Проверяет, есть ли записи в configStorage.getEnterprises/getSellers.
 * 2) Если массивы пусты, загружает данные из:
 *    - enterpriseStore (config/enterprises.json / Blob)
 *    - profileStore (config/profiles.json / Blob / env)
 * 3) Сохраняет нормализованные массивы в Redis через configStorage.
 *
 * Вызывается из serverContextV2 перед созданием DomainResolver.
 */
export async function ensureEnterprisesAndSellersSeeded() {
  if (bootstrapDone) return;

  let storedEnterprises = [];
  let storedSellers = [];

  try {
    const value = await configStorage.getEnterprises();
    if (Array.isArray(value)) {
      storedEnterprises = value;
    }
  } catch {
    storedEnterprises = [];
  }

  try {
    const value = await configStorage.getSellers();
    if (Array.isArray(value)) {
      storedSellers = value;
    }
  } catch {
    storedSellers = [];
  }

  const hasEnterprises =
    Array.isArray(storedEnterprises) && storedEnterprises.length > 0;
  const hasSellers =
    Array.isArray(storedSellers) && storedSellers.length > 0;

  let enterprisesToUse = storedEnterprises;
  let sellersToUse = storedSellers;

  // ---- Enterprises ----
  if (!hasEnterprises) {
    const legacyEnterprises = await getAllEnterprises();

    enterprisesToUse = (legacyEnterprises || []).map((ent) => ({
      id: ent.id,
      name: ent.name,
      slug: ent.slug || null,
      settings: ent.settings || {}
    }));

    if (typeof configStorage.saveEnterprises === 'function') {
      try {
        await configStorage.saveEnterprises(enterprisesToUse);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          '[configBootstrap] failed to seed enterprises into configStorage',
          e
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        '[configBootstrap] configStorage.saveEnterprises is not a function, skip seeding'
      );
    }
  }

  // ---- Sellers ----
  if (!hasSellers) {
    await ensureProfilesLoaded();
    const profiles = getAllProfiles() || [];

    const sellers = profiles.map((profile) => {
      const profileId = String(profile.id);

      return {
        id: profileId,
        name: profile.name || profileId,
        enterpriseId: null,
        // целевая схема хранения Seller в Redis:
        //  - ozon_client_id / ozon_api_key — учётные данные OZON;
        //  - client_hint / description    — метаданные для UI;
        ozon_client_id: profile.ozon_client_id || null,
        ozon_api_key: profile.ozon_api_key || null,
        client_hint:
          profile.client_hint ||
          (profile.ozon_client_id
            ? String(profile.ozon_client_id).slice(0, 8)
            : null),
        description: profile.description || ''
      };
    });

    sellersToUse = sellers;

    if (typeof configStorage.saveSellers === 'function') {
      try {
        await configStorage.saveSellers(sellersToUse);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          '[configBootstrap] failed to seed sellers into configStorage',
          e
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        '[configBootstrap] configStorage.saveSellers is not a function, skip seeding'
      );
    }
  }

  bootstrapDone = true;
}

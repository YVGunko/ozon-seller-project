// src/server/configBootstrap.js
//
// Инициализация configStorage данными из существующих JSON‑конфигов.
// Используется как миграционный слой: при первом обращении
// заполняем Redis (config:enterprises / config:sellers) на основе
// enterpriseStore + profileStore.

import { configStorage } from '../services/configStorage';
import { getAllEnterprises, findEnterpriseByProfileId } from './enterpriseStore';
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

  const [storedEnterprises, storedSellers] = await Promise.all([
    configStorage.getEnterprises().catch(() => []),
    configStorage.getSellers().catch(() => [])
  ]);

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

    try {
      await configStorage.saveEnterprises(enterprisesToUse);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        '[configBootstrap] failed to seed enterprises into configStorage',
        e
      );
    }
  }

  // ---- Sellers ----
  if (!hasSellers) {
    await ensureProfilesLoaded();
    const profiles = getAllProfiles() || [];

    const sellers = [];

    for (const profile of profiles) {
      const profileId = String(profile.id);

      let enterpriseId = null;
      try {
        const enterprise = await findEnterpriseByProfileId(profileId);
        if (enterprise) {
          enterpriseId = enterprise.id;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          '[configBootstrap] failed to resolve enterprise for profile',
          profileId,
          e
        );
      }

      sellers.push({
        id: profileId,
        name: profile.name || profileId,
        enterpriseId,
        ozonClientId: profile.ozon_client_id || null
      });
    }

    sellersToUse = sellers;

    try {
      await configStorage.saveSellers(sellersToUse);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        '[configBootstrap] failed to seed sellers into configStorage',
        e
      );
    }
  }

  bootstrapDone = true;
}


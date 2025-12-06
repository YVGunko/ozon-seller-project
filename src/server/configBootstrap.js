// src/server/configBootstrap.js
//
// Инициализация configStorage данными из существующих JSON‑конфигов.
// Используется как миграционный слой: при первом обращении
// заполняем Redis (config:enterprises) на основе enterpriseStore.
// Список продавцов (config:sellers) теперь считается первичным
// источником правды и НЕ синхронизируется с profileStore.

import { configStorage } from '../services/configStorage';
import { getAllEnterprises } from './enterpriseStore';

let bootstrapDone = false;

/**
 * ensureEnterprisesAndSellersSeeded
 *
 * 1) Проверяет, есть ли записи в configStorage.getEnterprises/getSellers.
 * 2) Если enterprises пусты, загружает данные из enterpriseStore
 *    (config/enterprises.json / Blob) и сохраняет в Redis.
 * 3) Список продавцов (sellers) больше не синхронизируется из profileStore:
 *    его нужно настраивать напрямую через config:sellers (админ‑UI / API).
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
  const hasSellers = Array.isArray(storedSellers) && storedSellers.length > 0;

  let enterprisesToUse = storedEnterprises;

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
  // Раньше, если sellers были пусты, здесь выполнялось авто‑синхронизирование
  // из profileStore (OZON_PROFILES / config/profiles.json). Это приводило
  // к разъезду конфигов и путанице. Сейчас мы намеренно НИЧЕГО не делаем:
  // если config:sellers пуст, администратор должен явно его заполнить
  // через соответствующие инструменты (админ‑UI / API).
  if (!hasSellers) {
    // eslint-disable-next-line no-console
    console.warn(
      '[configBootstrap] config:sellers is empty; заполните список продавцов через admin‑инструменты'
    );
  }

  bootstrapDone = true;
}

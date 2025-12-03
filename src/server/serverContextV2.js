// src/server/serverContextV2.js
//
// serverContextV2 — тонкий слой, который склеивает:
//   1. AuthContext (кто пользователь)
//   2. configStorage (Redis / файлы)
//   3. DomainResolver (enterprise / seller контекст)
//
// Никакой логики товаров, профилей или Ozon здесь нет.

import { getAuthContext } from './authContext';
import { ensureAuth } from './ensureAuth';
import { configStorage } from '../services/configStorage';
import { DomainResolver } from '../domain/services/domainResolver';
import { ensureEnterprisesAndSellersSeeded } from './configBootstrap';

/**
 * serverContextV2(req, res, options?)
 *
 * options:
 *   - requireAuth?: boolean (по умолчанию true)
 *   - activeEnterpriseId?: string
 *   - activeSellerId?: string
 *   - activeSellerIds?: string[]
 *
 * Возвращает:
 * {
 *   auth: { isAuthenticated, user },
 *   domain: {
 *     user,
 *     enterprises,
 *     sellers,
 *     activeEnterprise,
 *     activeSellerIds
 *   },
 *   storage: configStorage,
 *   resolver: DomainResolver instance
 * }
 */
export async function serverContextV2(req, res, options = {}) {
  const {
    requireAuth = true,
    activeEnterpriseId = null,
    activeSellerId = null,
    activeSellerIds = null
  } = options;

  // 1. Авторизация (строгая или мягкая)
  let auth;

  if (requireAuth) {
    // Бросит 401, если пользователь не авторизован
    auth = await ensureAuth(req, res);
  } else {
    // Мягкий режим: просто узнаём, есть ли пользователь
    auth = await getAuthContext(req, res);
  }

  const user = auth.isAuthenticated ? auth.user : null;

  // Перед тем как строить доменный контекст, убеждаемся,
  // что в configStorage инициализированы enterprises / sellers.
  await ensureEnterprisesAndSellersSeeded();

  // 2. DomainResolver на базе configStorage
  const resolver = new DomainResolver({ configStorage });

  const domain = await resolver.resolve(user, {
    activeEnterpriseId,
    activeSellerId,
    activeSellerIds
  });

  // 3. Общий контекст для API / SSR
  return {
    auth,
    domain,
    storage: configStorage,
    resolver
  };
}

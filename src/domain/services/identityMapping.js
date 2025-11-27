// src/domain/services/identityMapping.js
//
// Временный мост между текущей моделью (Profile / Seller в проекте)
// и новой доменной моделью Root / Enterprise / Seller / User.
//
// ВАЖНО:
// - этот модуль не должен знать деталей Next.js или конкретной БД;
// - он просто умеет "интерпретировать" существующий профиль
//   как Enterprise + Seller, чтобы плавно мигрировать архитектуру.

import { createRoot } from '../entities/root';
import { createEnterprise } from '../entities/enterprise';
import { createSeller } from '../entities/seller';
import { createUser } from '../entities/user';

/**
 * @typedef {Object} ProfileLike
 * @property {string} id
 * @property {string} [name]
 * @property {string} [client_id]
 * @property {string} [ozon_client_id]
 * @property {string} [ozon_api_key]
 */

/**
 * Построить Root / Enterprise / Seller из текущего "профиля" OZON.
 * Это чистая функция без побочных эффектов — только формирование структур.
 *
 * @param {ProfileLike} profile
 * @param {import('../entities/enterprise').Enterprise} [enterpriseOverride]
 * @returns {{ root: import('../entities/root').Root, enterprise: import('../entities/enterprise').Enterprise, seller: import('../entities/seller').Seller }}
 */
export function mapProfileToEnterpriseAndSeller(profile, enterpriseOverride) {
  const root = createRoot();

  const enterprise =
    enterpriseOverride ||
    createEnterprise({
      id: `ent-${profile.id}`,
      rootId: root.id,
      name: profile.name || `Enterprise ${profile.id}`,
      slug: null,
      settings: {}
    });

  const sellerId = `sell-${profile.id}`;
  const seller = createSeller({
    id: sellerId,
    enterpriseId: enterprise.id,
    marketplace: 'ozon',
    name: profile.name || `Seller ${profile.id}`,
    externalIds: {
      clientId: profile.client_id || profile.ozon_client_id || null
    },
    metadata: {}
  });

  return { root, enterprise, seller };
}

/**
 * Построить User, связанного с Enterprise, на основе auth‑данных.
 * Здесь мы не создаём запись в БД, а только описываем целевую структуру.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} [params.username]
 * @param {string} [params.email]
 * @param {string} [params.name]
 * @param {string} params.enterpriseId
 * @param {string[]} [params.roles]
 * @param {string[]} [params.sellerIds]
 * @returns {import('../entities/user').User}
 */
export function mapAuthToUser(params) {
  return createUser({
    id: params.userId,
    enterpriseId: params.enterpriseId,
    username: params.username || params.userId,
    email: params.email || '',
    name: params.name,
    roles: params.roles || [],
    sellerIds: params.sellerIds || [],
    preferences: {}
  });
}

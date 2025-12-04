// src/server/serverContext.js
//
// Устаревший server-side контекст, используемый продуктовыми / атрибутными
// API‑роутами. Постепенно вытесняется serverContextV2 + DomainResolver.
//
// Теперь основан на configStorage (config:sellers / config:users),
// а не на profileStore (config/profiles.json).

import {
  mapProfileToEnterpriseAndSeller,
  mapAuthToUser
} from '../domain/services/identityMapping';
import { getAuthContext } from './authContext';
import { configStorage } from '../services/configStorage';

/**
 * @typedef {Object} ServerContext
 * @property {null} session          // для обратной совместимости, не используется
 * @property {import('../domain/entities/user').User|null} user
 * @property {Object|null} profile   // { id, name, ozon_client_id, ozon_api_key, ... }
 * @property {string|null} profileId
 * @property {import('../domain/entities/enterprise').Enterprise|null} enterprise
 * @property {import('../domain/entities/seller').Seller|null} seller
 */

/**
 * Получить server-side контекст (устаревший формат).
 *
 * Сейчас:
 *  - user берётся из getAuthContext (JWT + Redis);
 *  - profile/seller строятся на основе config:sellers и profileId из запроса.
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {{ requireProfile?: boolean }} [options]
 * @returns {Promise<ServerContext>}
 */
export async function resolveServerContext(req, res, options = {}) {
  const { requireProfile = false } = options;

  const auth = await getAuthContext(req, res);

  if (!auth.isAuthenticated) {
    if (requireProfile) {
      const error = new Error('Unauthorized');
      error.statusCode = 401;
      throw error;
    }
    return {
      session: null,
      user: null,
      profile: null,
      profileId: null,
      enterprise: null,
      seller: null
    };
  }

  const rawUser = auth.user;

  const profileIdFromReq =
    (req.query && (req.query.profileId || req.query.profile_id)) ||
    (req.body && (req.body.profileId || req.body.profile_id)) ||
    null;

  let profile = null;
  let enterprise = null;
  let seller = null;
  let profileId = profileIdFromReq ? String(profileIdFromReq) : null;

  if (profileId) {
    const allowedProfiles = Array.isArray(rawUser.allowedProfiles)
      ? rawUser.allowedProfiles.map((p) => String(p))
      : [];

    // Если у пользователя есть ограничения по профилям — строго проверяем доступ.
    if (allowedProfiles.length > 0 && !allowedProfiles.includes(profileId)) {
      const error = new Error('Profile is not allowed for current user');
      error.statusCode = 403;
      throw error;
    }

    // Ищем seller в config:sellers.
    const rawSellers = await configStorage.getSellers();
    const sellersArr = Array.isArray(rawSellers) ? rawSellers : [];
    const sellerRow =
      sellersArr.find((s) => String(s.id) === profileId) || null;

    if (!sellerRow) {
      const error = new Error('Profile not found');
      error.statusCode = 404;
      throw error;
    }

    const ozonClientId =
      sellerRow.ozon_client_id ?? sellerRow.ozonClientId ?? null;
    const ozonApiKey = sellerRow.ozon_api_key ?? null;

    profile = {
      id: String(sellerRow.id),
      name: sellerRow.name || `Профиль ${sellerRow.id}`,
      ozon_client_id: ozonClientId,
      ozon_api_key: ozonApiKey,
      client_hint:
        sellerRow.client_hint ||
        (ozonClientId ? String(ozonClientId).slice(0, 8) : ''),
      description: sellerRow.description || ''
    };

    profileId = profile.id;

    const mapped = mapProfileToEnterpriseAndSeller(profile);
    enterprise = mapped.enterprise;
    seller = mapped.seller;
  } else if (requireProfile) {
    const error = new Error('profileId is required');
    error.statusCode = 400;
    throw error;
  }

  let user = null;
  if (rawUser && rawUser.id) {
    const username = rawUser.username || rawUser.id;
    const email =
      rawUser.email ||
      (username.includes('@') ? username : `${rawUser.id}@local`);
    const name = rawUser.name || '';
    const enterpriseId = enterprise?.id || rawUser.enterpriseId || `ent-${rawUser.id}`;
    const sellerIds = seller ? [seller.id] : [];

    user = mapAuthToUser({
      userId: rawUser.id,
      username,
      email,
      name,
      enterpriseId,
      roles: rawUser.roles || [],
      sellerIds
    });
  }

  return {
    session: null,
    user,
    profile,
    profileId,
    enterprise,
    seller
  };
}

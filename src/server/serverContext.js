// src/server/serverContext.js
//
// Единая точка для получения server-side контекста:
// session (next-auth), profile, enterprise, seller, user.
// Используется в API-роутах вместо ручных вызовов getServerSession / profileResolver.

import { getServerSession } from 'next-auth/next';
import { authOptions } from './authOptions';
import { getProfileById } from './profileStore';
import {
  mapProfileToEnterpriseAndSeller,
  mapAuthToUser
} from '../domain/services/identityMapping';

const isProfileAllowed = (profileId, allowedProfiles = []) => {
  if (!Array.isArray(allowedProfiles) || allowedProfiles.length === 0) {
    return true;
  }
  return allowedProfiles.includes(profileId);
};

/**
 * @typedef {Object} ServerContext
 * @property {import('next-auth').Session|null} session
 * @property {import('../domain/entities/user').User|null} user
 * @property {Object|null} profile
 * @property {string|null} profileId
 * @property {import('../domain/entities/enterprise').Enterprise|null} enterprise
 * @property {import('../domain/entities/seller').Seller|null} seller
 */

/**
 * Получить server-side контекст.
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @param {{ requireProfile?: boolean }} [options]
 * @returns {Promise<ServerContext>}
 */
export async function resolveServerContext(req, res, options = {}) {
  const { requireProfile = false } = options;

  const session = await getServerSession(req, res, authOptions);

  if (!session) {
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

  const profileIdFromReq =
    (req.query && (req.query.profileId || req.query.profile_id)) ||
    (req.body && (req.body.profileId || req.body.profile_id)) ||
    null;

  let profile = null;
  let enterprise = null;
  let seller = null;
  let profileId = profileIdFromReq;

  if (profileIdFromReq) {
    if (!isProfileAllowed(profileIdFromReq, session.user?.allowedProfiles)) {
      const error = new Error('Profile is not allowed for current user');
      error.statusCode = 403;
      throw error;
    }
    const found = getProfileById(profileIdFromReq);
    if (!found) {
      const error = new Error('Profile not found');
      error.statusCode = 404;
      throw error;
    }
    profile = found;
    profileId = found.id;
    const mapped = mapProfileToEnterpriseAndSeller(found);
    enterprise = mapped.enterprise;
    seller = mapped.seller;
  } else if (requireProfile) {
    const error = new Error('profileId is required');
    error.statusCode = 400;
    throw error;
  }

  let user = null;
  const rawUser = session.user || {};
  const rawUserId = rawUser.id || rawUser.email || null;

  if (rawUserId) {
    const email = rawUser.email || `${rawUserId}@local`;
    const name = rawUser.name || '';
    const enterpriseId = enterprise?.id || `ent-${rawUserId}`;
    const sellerIds = seller ? [seller.id] : [];

    user = mapAuthToUser({
      userId: rawUserId,
      email,
      name,
      enterpriseId,
      roles: rawUser.roles || [],
      sellerIds
    });
  }

  return {
    session,
    user,
    profile,
    profileId,
    enterprise,
    seller
  };
}


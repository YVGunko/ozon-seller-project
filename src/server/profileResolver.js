import { getServerSession } from 'next-auth/next';
import { authOptions } from './authOptions';
import { getProfileById } from './profileStore';

const isProfileAllowed = (profileId, allowedProfiles = []) => {
  if (!Array.isArray(allowedProfiles) || allowedProfiles.length === 0) {
    return true;
  }
  return allowedProfiles.includes(profileId);
};

export const resolveProfileFromRequest = async (req, res) => {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    const error = new Error('Unauthorized');
    error.statusCode = 401;
    throw error;
  }

  const profileId =
    (req.query && (req.query.profileId || req.query.profile_id)) ||
    (req.body && (req.body.profileId || req.body.profile_id));

  if (!profileId || typeof profileId !== 'string') {
    const error = new Error('profileId is required');
    error.statusCode = 400;
    throw error;
  }

  if (!isProfileAllowed(profileId, session.user?.allowedProfiles)) {
    const error = new Error('Profile is not allowed for current user');
    error.statusCode = 403;
    throw error;
  }

  const profile = getProfileById(profileId);
  if (!profile) {
    const error = new Error('Profile not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    session,
    profileId,
    profile
  };
};

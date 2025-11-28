import {
  getProfileMetadataList,
  ensureProfilesLoaded
} from '../../src/server/profileStore';
import { withServerContext } from '../../src/server/apiUtils';

async function handler(req, res, ctx) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { auth } = ctx;

  if (!auth || !auth.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await ensureProfilesLoaded();
  const profiles = getProfileMetadataList(auth.user.allowedProfiles);
  return res.status(200).json({ profiles });
}

export default withServerContext(handler, { requireAuth: true });

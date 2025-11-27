import { getProfileMetadataList, ensureProfilesLoaded } from '../../src/server/profileStore';
import { resolveServerContext } from '../../src/server/serverContext';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session } = await resolveServerContext(req, res);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await ensureProfilesLoaded();
    const profiles = getProfileMetadataList(session.user?.allowedProfiles);
    return res.status(200).json({ profiles });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/profiles] error', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Internal server error' });
  }
}

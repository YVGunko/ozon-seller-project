import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../src/server/authOptions';
import { getProfileMetadataList, ensureProfilesLoaded } from '../../src/server/profileStore';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await ensureProfilesLoaded();
  const profiles = getProfileMetadataList(session.user?.allowedProfiles);
  return res.status(200).json({ profiles });
}

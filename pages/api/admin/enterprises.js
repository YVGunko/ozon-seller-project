// pages/api/admin/enterprises.js
//
// Read‑only admin‑эндпоинт: вернуть список Enterprise из enterpriseStore.

import { resolveServerContext } from '../../../src/server/serverContext';
import { getAllEnterprises, getEnterprisesForProfileIds } from '../../../src/server/enterpriseStore';
import { canManageEnterprises, canViewEnterprises, isRootAdmin } from '../../../src/domain/services/accessControl';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const serverContext = await resolveServerContext(req, res, {
      requireProfile: false
    });

    const { user, session } = serverContext;

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!canViewEnterprises(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let enterprises;
    if (canManageEnterprises(user)) {
      // root/admin — видит все Enterprise
      enterprises = await getAllEnterprises();
    } else {
      // manager — только Enterprise, связанные с его профилями
      const allowedProfiles =
        (session && session.user && session.user.allowedProfiles) || [];
      enterprises = await getEnterprisesForProfileIds(allowedProfiles);
    }

    const items = enterprises.map((ent) => ({
      id: ent.id,
      name: ent.name,
      slug: ent.slug,
      settings: ent.settings || {}
    }));

    return res.status(200).json({ items });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('/api/admin/enterprises error', error);
    return res
      .status(500)
      .json({ error: error?.message || 'Failed to load enterprises' });
  }
}

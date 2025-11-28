// pages/api/admin/enterprises.js
//
// Read‑only admin‑эндпоинт: вернуть список Enterprise из enterpriseStore.

import { withServerContext } from '../../../src/server/apiUtils';
import {
  getAllEnterprises,
  getEnterprisesForProfileIds
} from '../../../src/server/enterpriseStore';
import {
  canManageEnterprises,
  canViewEnterprises
} from '../../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { auth } = ctx;
  const user = auth.user;

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
    const allowedProfiles = Array.isArray(user.allowedProfiles)
      ? user.allowedProfiles
      : [];
    enterprises = await getEnterprisesForProfileIds(allowedProfiles);
  }

  const items = enterprises.map((ent) => ({
    id: ent.id,
    name: ent.name,
    slug: ent.slug,
    settings: ent.settings || {}
  }));

  return res.status(200).json({ items });
}

export default withServerContext(handler, { requireAuth: true });

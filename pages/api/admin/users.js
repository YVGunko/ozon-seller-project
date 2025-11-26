// pages/api/admin/users.js
//
// Простой admin-эндпоинт: вернуть список пользователей,
// основанный на конфигурации userStore (AUTH_USERS / ADMIN_* env).
// Пока только чтение, без редактирования.

import { resolveServerContext } from '../../../src/server/serverContext';
import { getAuthUsers } from '../../../src/server/userStore';
import { mapAuthUsersToDomainUsers } from '../../../src/domain/services/userDirectory';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const serverContext = await resolveServerContext(req, res, {
      requireProfile: false
    });

    if (!serverContext.session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const enterpriseId = serverContext.enterprise?.id || 'ent-legacy';
    const authUsers = getAuthUsers();
    const users = mapAuthUsersToDomainUsers({ enterpriseId, authUsers });

    const items = users.map((user) => ({
      id: user.id,
      enterpriseId: user.enterpriseId,
      name: user.name,
      email: user.email,
      roles: user.roles,
      sellerIds: user.sellerIds,
      username: user.preferences?.username || '',
      allowedProfiles: user.preferences?.allowedProfiles || []
    }));

    return res.status(200).json({ items });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('/api/admin/users error', error);
    return res
      .status(500)
      .json({ error: error?.message || 'Failed to load users' });
  }
}


import { OzonApiService } from '../../src/services/ozon-api';
import { resolveServerContext } from '../../src/server/serverContext';
import { canManageOrders } from '../../src/domain/services/accessControl';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile, user } = await resolveServerContext(req, res, {
      requireProfile: true
    });

    if (!user || !canManageOrders(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const service = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const orders = await service.getOrders();
    res.status(200).json(orders);
  } catch (error) {
    console.error('[orders] Failed to fetch orders', error);
    res.status(500).json({
      error: 'Failed to fetch orders',
      details: error.message
    });
  }
}

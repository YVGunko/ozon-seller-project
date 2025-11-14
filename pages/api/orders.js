import { OzonApiService } from '../../src/services/ozon-api';
import { resolveProfileFromRequest } from '../../src/server/profileResolver';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile } = await resolveProfileFromRequest(req, res);
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

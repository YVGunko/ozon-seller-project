import { OzonApiService } from '../../src/services/ozon-api';
import { withServerContext } from '../../src/server/apiUtils';
import { canManageOrders } from '../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = domain.user || auth.user || null;
    if (!user || !canManageOrders(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { profile } = await (await import('../../src/server/serverContext')).resolveServerContext(
      req,
      res,
      { requireProfile: true }
    );
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

export default withServerContext(handler, { requireAuth: true });

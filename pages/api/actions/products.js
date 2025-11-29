import { OzonApiService } from '../../../src/services/ozon-api';
import { withServerContext } from '../../../src/server/apiUtils';
import { canManagePrices } from '../../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { action_id } = body;
    if (action_id === undefined || action_id === null) {
      return res.status(400).json({ error: 'action_id is required' });
    }

    const user = domain.user || auth.user || null;
    if (!user || !canManagePrices(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { profile } = await (await import('../../../src/server/serverContext')).resolveServerContext(
      req,
      res,
      { requireProfile: true }
    );
    const service = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const data = await service.getActionProducts(body);
    return res.status(200).json(data);
  } catch (error) {
    console.error('❌ /api/actions/products error:', error);
    const status = error?.status || error?.statusCode || 500;
    const message = error?.message || 'Failed to fetch action products';
    res.status(status).json({ error: message, details: error?.data || null });
  }
}

export default withServerContext(handler, { requireAuth: true });

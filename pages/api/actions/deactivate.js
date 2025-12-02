import { withServerContext } from '../../../src/server/apiUtils';
import { canManagePrices } from '../../../src/domain/services/accessControl';
import { OzonApiService } from '../../../src/services/ozon-api';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = domain.user || auth.user || null;
  if (!user || !canManagePrices(user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const body = req.body || {};
    const { action_id, product_ids } = body;

    if (action_id === undefined || action_id === null) {
      return res.status(400).json({ error: 'action_id is required' });
    }
    if (!Array.isArray(product_ids) || !product_ids.length) {
      return res.status(400).json({ error: 'product_ids array is required' });
    }

    const { profile } = await (await import('../../../src/server/serverContext')).resolveServerContext(
      req,
      res,
      { requireProfile: true }
    );

    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const result = await ozon.deactivateActionProducts({
      action_id,
      product_ids
    });

    return res.status(200).json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ /api/actions/deactivate error:', error);
    const status = error?.status || error?.statusCode || 500;
    const message = error?.message || 'Failed to deactivate action products';
    return res.status(status).json({
      error: message,
      details: error?.data || null
    });
  }
}

export default withServerContext(handler, { requireAuth: true });


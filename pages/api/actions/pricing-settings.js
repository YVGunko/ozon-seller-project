import { withServerContext } from '../../../src/server/apiUtils';
import { readActionPricing, writeActionPricing } from '../../../src/server/actionPricingStore';
import { canManagePrices } from '../../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;
  try {
    const user = domain.user || auth.user || null;
    if (!user || !canManagePrices(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { profile } = await (await import('../../../src/server/serverContext')).resolveServerContext(
      req,
      res,
      { requireProfile: true }
    );
    if (req.method === 'GET') {
      const data = await readActionPricing(profile.id);
      return res.status(200).json(data || {});
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      await writeActionPricing(profile.id, body);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const status = error?.statusCode || 500;
    return res.status(status).json({ error: error?.message || 'Failed to process request' });
  }
}

export default withServerContext(handler, { requireAuth: true });

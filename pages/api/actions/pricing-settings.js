import { resolveServerContext } from '../../../src/server/serverContext';
import { readActionPricing, writeActionPricing } from '../../../src/server/actionPricingStore';
import { canManagePrices } from '../../../src/domain/services/accessControl';

export default async function handler(req, res) {
  try {
    const { profile, user } = await resolveServerContext(req, res, { requireProfile: true });
    if (!user || !canManagePrices(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
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

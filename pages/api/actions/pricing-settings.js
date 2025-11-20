import { resolveProfileFromRequest } from '../../../src/server/profileResolver';
import { readActionPricing, writeActionPricing } from '../../../src/server/actionPricingStore';

export default async function handler(req, res) {
  try {
    const { profile } = await resolveProfileFromRequest(req, res);
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

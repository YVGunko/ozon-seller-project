import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';
import { canManagePrices } from '../../../src/domain/services/accessControl';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { action_id } = body;
    if (action_id === undefined || action_id === null) {
      return res.status(400).json({ error: 'action_id is required' });
    }

    const { profile, user } = await resolveServerContext(req, res, { requireProfile: true });
    if (!user || !canManagePrices(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const service = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const data = await service.getActionCandidates(body);
    return res.status(200).json(data);
  } catch (error) {
    console.error('❌ /api/actions/candidates error:', error);
    const status = error?.status || error?.statusCode || 500;
    const message = error?.message || 'Failed to fetch action candidates';
    res.status(status).json({ error: message, details: error?.data || null });
  }
}

import { OzonApiService } from '../../src/services/ozon-api';
import { withServerContext } from '../../src/server/apiUtils';

async function handler(req, res, ctx) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { domain } = ctx;
    const profileId = req.query.profileId
      ? String(req.query.profileId)
      : null;

    const candidateSellers = Array.isArray(domain?.sellers)
      ? domain.sellers
      : [];

    const targetId =
      profileId ||
      (candidateSellers.length > 0 ? String(candidateSellers[0].id) : null);

    if (!targetId) {
      return res.status(400).json({ error: 'profileId is required' });
    }

    const seller = candidateSellers.find(
      (s) => String(s.id) === targetId
    );

    if (!seller) {
      return res
        .status(403)
        .json({ error: 'Profile is not allowed for current user' });
    }

    const ozonClientId =
      (seller.externalIds && seller.externalIds.clientId
        ? seller.externalIds.clientId
        : seller.ozon_client_id) || null;
    const ozonApiKey =
      (seller.metadata && seller.metadata.ozon_api_key
        ? seller.metadata.ozon_api_key
        : seller.ozon_api_key) || null;

    if (!ozonClientId || !ozonApiKey) {
      return res
        .status(400)
        .json({ error: 'Seller has no OZON credentials' });
    }

    const ozon = new OzonApiService(ozonApiKey, ozonClientId);
    const response = await ozon.getWarehouses();
    const result = Array.isArray(response?.result) ? response.result : [];

    return res.status(200).json({ result });
  } catch (error) {
    console.error('Failed to load warehouses', error);
    return res
      .status(500)
      .json({ error: error.message || 'Failed to load warehouses' });
  }
}

export default withServerContext(handler, { requireAuth: true });

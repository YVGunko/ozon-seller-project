import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveProfileFromRequest } from '../../../src/server/profileResolver';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { offer_id } = req.query;
    if (!offer_id) {
      res.status(400).json({ error: 'Missing offer_id' });
      return;
    }

    const { profile } = await resolveProfileFromRequest(req, res);
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.getProductInfoList([offer_id]);
    const items =
      Array.isArray(response?.items) && response.items.length
        ? response.items
        : Array.isArray(response?.result?.items)
        ? response.result.items
        : [];

    res.status(200).json({
      items,
      raw: response
    });
  } catch (error) {
    console.error('❌ /api/products/info-list error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch product info list'
    });
  }
}

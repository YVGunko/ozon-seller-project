import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveProfileFromRequest } from '../../../src/server/profileResolver';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { profile } = await resolveProfileFromRequest(req, res);
    const { skus } = req.body || {};
    if (!Array.isArray(skus) || !skus.length) {
      return res.status(400).json({ error: 'skus array is required' });
    }
    const service = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const data = await service.getProductRatingBySku({ skus });
    return res.status(200).json(data);
  } catch (error) {
    console.error('[products/rating-by-sku] error', error);
    const status = error?.status || error?.statusCode || 500;
    return res.status(status).json({
      error: error?.message || 'Failed to fetch product rating',
      details: error?.data || null
    });
  }
}

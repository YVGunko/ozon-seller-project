import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';
import { canManageProducts } from '../../../src/domain/services/accessControl';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { productIds } = req.body || {};
    if (!Array.isArray(productIds) || !productIds.length) {
      return res.status(400).json({ error: 'productIds are required' });
    }

    const { profile, user } = await resolveServerContext(req, res, { requireProfile: true });
    if (!user || !canManageProducts(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.generateBarcodes(productIds);
    return res.status(200).json(response);
  } catch (error) {
    console.error('[products/barcodes] Failed', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate barcodes',
      details: error?.data || null
    });
  }
}

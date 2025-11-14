import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveProfileFromRequest } from '../../../src/server/profileResolver';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Не переданы товары для импорта' });
    }

    const { profile } = await resolveProfileFromRequest(req, res);
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.createProductsBatch(items);
    return res.status(200).json(response);
  } catch (error) {
    console.error('[products/import] Failed', error);
    return res.status(500).json({
      error: error?.message || 'Failed to import products',
      details: error?.data || null
    });
  }
}

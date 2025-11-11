import { OzonApiService } from '../../../src/services/ozon-api';

const parseProfile = (rawProfile) => {
  if (!rawProfile) {
    throw new Error('Missing OZON profile');
  }

  if (typeof rawProfile === 'string') {
    try {
      return JSON.parse(decodeURIComponent(rawProfile));
    } catch {
      throw new Error('Invalid profile format');
    }
  }

  return rawProfile;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { offer_id, profile } = req.query;
    if (!offer_id) {
      res.status(400).json({ error: 'Missing offer_id' });
      return;
    }

    const parsedProfile = parseProfile(profile);
    const { ozon_client_id, ozon_api_key } = parsedProfile || {};

    if (!ozon_client_id || !ozon_api_key) {
      res
        .status(400)
        .json({ error: 'Profile must include ozon_client_id and ozon_api_key' });
      return;
    }

    const ozon = new OzonApiService(ozon_api_key, ozon_client_id);
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


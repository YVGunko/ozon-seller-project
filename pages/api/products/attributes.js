// pages/api/attributes.js
import { OzonApiService } from '../../../src/services/ozon-api';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { offer_id, profile } = req.query;

    if (!offer_id) {
      return res.status(400).json({ error: 'Missing offer_id' });
    }

    if (!profile) {
      return res.status(400).json({ error: 'Missing OZON profile' });
    }

    let parsedProfile;
    try {
      parsedProfile = JSON.parse(decodeURIComponent(profile));
    } catch {
      return res.status(400).json({ error: 'Invalid profile format' });
    }

    const { ozon_client_id, ozon_api_key } = parsedProfile;
    if (!ozon_client_id || !ozon_api_key) {
      return res.status(400).json({
        error: 'Profile must include ozon_client_id and ozon_api_key'
      });
    }

    const ozon = new OzonApiService(ozon_api_key, ozon_client_id);

    // 🔍 Запрашиваем атрибуты по offer_id
    const result = await ozon.getProductAttributes(offer_id);

    return res.status(200).json(result);
  } catch (error) {
    console.error('❌ /api/attributes error:', error);
    return res.status(500).json({
      error: 'Failed to fetch attributes from OZON API',
      details: error.message
    });
  }
}

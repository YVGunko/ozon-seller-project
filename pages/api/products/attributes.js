// pages/api/attributes.js
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
  try {
    if (req.method === 'GET') {
      const { offer_id, profile } = req.query;

      if (!offer_id) {
        return res.status(400).json({ error: 'Missing offer_id' });
      }

      const parsedProfile = parseProfile(profile);

      const { ozon_client_id, ozon_api_key } = parsedProfile || {};
      if (!ozon_client_id || !ozon_api_key) {
        return res.status(400).json({
          error: 'Profile must include ozon_client_id and ozon_api_key'
        });
      }

      const ozon = new OzonApiService(ozon_api_key, ozon_client_id);

      const result = await ozon.getProductAttributes(offer_id);

      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const { items, profile } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Не переданы товары для обновления' });
      }

      const parsedProfile = parseProfile(profile);
      const { ozon_client_id, ozon_api_key } = parsedProfile || {};

      if (!ozon_client_id || !ozon_api_key) {
        return res.status(400).json({
          error: 'Profile must include ozon_client_id and ozon_api_key'
        });
      }

      const ozon = new OzonApiService(ozon_api_key, ozon_client_id);
      const result = await ozon.updateProductAttributes(items);

      return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('❌ /api/attributes error:', error);
    return res.status(500).json({
      error: 'Failed to process attributes request',
      details: error.message
    });
  }
}

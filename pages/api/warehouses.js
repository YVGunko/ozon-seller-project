import { OzonApiService } from '../../src/services/ozon-api';

const parseProfile = (rawProfile) => {
  if (!rawProfile) {
    throw new Error('Missing OZON profile');
  }

  if (typeof rawProfile === 'string') {
    try {
      return JSON.parse(decodeURIComponent(rawProfile));
    } catch (error) {
      throw new Error('Invalid profile format');
    }
  }

  return rawProfile;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile } = req.query;
    const parsedProfile = parseProfile(profile);
    const { ozon_client_id, ozon_api_key } = parsedProfile || {};

    if (!ozon_client_id || !ozon_api_key) {
      return res.status(400).json({ error: 'Profile must include ozon_client_id and ozon_api_key' });
    }

    const ozon = new OzonApiService(ozon_api_key, ozon_client_id);
    const response = await ozon.getWarehouses();
    const result = Array.isArray(response?.result) ? response.result : [];

    return res.status(200).json({ result });
  } catch (error) {
    console.error('Failed to load warehouses', error);
    return res.status(500).json({ error: error.message || 'Failed to load warehouses' });
  }
}

import { OzonApiService } from '../../src/services/ozon-api';
import { resolveServerContext } from '../../src/server/serverContext';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile } = await resolveServerContext(req, res, { requireProfile: true });
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.getWarehouses();
    const result = Array.isArray(response?.result) ? response.result : [];

    return res.status(200).json({ result });
  } catch (error) {
    console.error('Failed to load warehouses', error);
    return res.status(500).json({ error: error.message || 'Failed to load warehouses' });
  }
}

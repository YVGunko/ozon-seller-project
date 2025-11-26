import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const prices = body.prices;
    if (!Array.isArray(prices) || !prices.length) {
      return res.status(400).json({ error: 'Передайте prices для импорта' });
    }

    const { profile } = await resolveServerContext(req, res, { requireProfile: true });
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.importPrices(prices);
    return res.status(200).json(response);
  } catch (error) {
    console.error('[products/import-prices] Failed', error);
    return res.status(error?.status || error?.statusCode || 500).json({
      error: error?.message || 'Failed to import prices',
      details: error?.data || null
    });
  }
}

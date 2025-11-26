import { OzonApiService } from '../../src/services/ozon-api';
import { resolveServerContext } from '../../src/server/serverContext';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stocks } = req.body || {};
    if (!Array.isArray(stocks) || !stocks.length) {
      return res.status(400).json({ error: 'Stocks payload is required' });
    }

    const { profile } = await resolveServerContext(req, res, { requireProfile: true });
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.updateProductStocks(stocks);
    return res.status(200).json(response);
  } catch (error) {
    console.error('[Stocks API] Failed to update stocks', error);
    const statusCode = error?.status && Number.isInteger(error.status) ? error.status : 500;
    return res.status(statusCode).json({
      error: error?.message || 'Failed to update stocks on OZON',
      details: error?.data || null
    });
  }
}

import { OzonApiService } from '../../src/services/ozon-api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile, stocks } = req.body || {};

    if (!profile) {
      return res.status(400).json({ error: 'Missing OZON profile' });
    }
    if (!Array.isArray(stocks) || !stocks.length) {
      return res.status(400).json({ error: 'Stocks payload is required' });
    }

    const { ozon_client_id, ozon_api_key } = profile;
    if (!ozon_client_id || !ozon_api_key) {
      return res
        .status(400)
        .json({ error: 'Profile must include ozon_client_id and ozon_api_key' });
    }

    const ozon = new OzonApiService(ozon_api_key, ozon_client_id);
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

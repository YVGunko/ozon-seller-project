// pages/api/products.js
import { OzonApiService } from '../../src/services/ozon-api';
import { resolveProfileFromRequest } from '../../src/server/profileResolver';

/**
 * Универсальный API route для получения списка товаров OZON.
 * Работает как backend proxy, чтобы избежать CORS и скрыть ключи.
 *
 * Пример запроса с клиента:
 * /api/products?limit=50&profile={...}
 */

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { limit = 20, last_id = '', offer_id } = req.query;
    const { profile } = await resolveProfileFromRequest(req, res);
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);

    const options = {
      limit: Number(limit),
      last_id,
      filter: { visibility: 'ALL' }
    };

    if (offer_id) {
      options.filter.offer_id = Array.isArray(offer_id) ? offer_id : [offer_id];
    }

    const products = await ozon.getProducts(options);
    return res.status(200).json(products);
  } catch (error) {
    console.error('❌ /api/products error:', error);
    return res.status(500).json({
      error: 'Failed to fetch products from OZON API',
      details: error.message
    });
  }
}

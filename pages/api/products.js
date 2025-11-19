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
      offer_ids: []
    };

    if (offer_id) {
      options.offer_ids = Array.isArray(offer_id) ? offer_id : [offer_id];
    }

    const products = await ozon.getProductInfoAttributes(options);
    return res.status(200).json(products);
  } catch (error) {
    const handledStatuses = new Set([400, 403, 404, 409]);
    const isTimeoutError =
      error?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';

    if (handledStatuses.has(error.status) || isTimeoutError) {
      console.warn('⚠️ /api/products handled error:', {
        status: error.status || (isTimeoutError ? 'timeout' : undefined),
        message: error.message || 'Unknown error',
        details: error.data || error.cause || null
      });
      return res.status(200).json({
        result: [],
        total: 0,
        last_id: '',
        warning:
          error.message || (isTimeoutError ? 'Не удалось подключиться к OZON API' : 'Запрос не вернул данных')
      });
    }

    console.error('❌ /api/products error:', error);
    return res.status(500).json({
      error: 'Failed to fetch products from OZON API',
      details: error.message
    });
  }
}

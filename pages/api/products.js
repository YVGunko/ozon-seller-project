// pages/api/products.js
import { OzonApiService } from '../../src/services/ozon-api';

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

    const { limit = 20, profile } = req.query;

    if (!profile) {
      return res.status(400).json({ error: 'Missing OZON profile' });
    }

    // 🔒 Безопасно декодируем профиль
    let parsedProfile;
    try {
      parsedProfile = JSON.parse(decodeURIComponent(profile));
    } catch {
      return res.status(400).json({ error: 'Invalid profile format' });
    }

    const { ozon_client_id, ozon_api_key } = parsedProfile;

    if (!ozon_client_id || !ozon_api_key) {
      return res.status(400).json({ error: 'Profile must include ozon_client_id and ozon_api_key' });
    }

    const ozon = new OzonApiService(ozon_api_key, ozon_client_id);

    const products = await ozon.getProducts({ limit: Number(limit) });

    return res.status(200).json(products);
  } catch (error) {
    console.error('❌ /api/products error:', error);
    return res.status(500).json({
      error: 'Failed to fetch products from OZON API',
      details: error.message
    });
  }
}

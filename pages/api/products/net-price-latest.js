import { resolveProfileFromRequest } from '../../../src/server/profileResolver';
import { getNetPriceHistory } from '../../../src/server/netPriceHistoryStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await resolveProfileFromRequest(req, res); // только авторизация, данные берём из BLOB
    const body = req.body || {};
    const ids = Array.isArray(body.productIds) ? body.productIds : [];
    const productIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));

    if (!productIds.length) {
      return res.status(400).json({ error: 'Передайте productIds' });
    }

    const entries = await Promise.all(
      productIds.map(async (id) => {
        try {
          const history = await getNetPriceHistory(id);
          const latest = Array.isArray(history) && history.length ? history[0] : null;
          return { productId: id, net_price: latest?.net_price ?? null, ts: latest?.ts ?? null };
        } catch (error) {
          console.error('[net-price-latest] failed for', id, error);
          return { productId: id, net_price: null, ts: null, error: error.message };
        }
      })
    );

    return res.status(200).json({ items: entries });
  } catch (error) {
    console.error('[net-price-latest] error', error);
    return res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch net price' });
  }
}

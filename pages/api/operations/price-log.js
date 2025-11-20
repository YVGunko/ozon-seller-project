import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveProfileFromRequest } from '../../../src/server/profileResolver';
import { appendPriceHistory } from '../../../src/server/priceHistoryStore';
import { appendNetPriceHistory } from '../../../src/server/netPriceHistoryStore';

const startOfTodayLocal = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const chunkArray = (items = [], size = 1000) => {
  if (!Array.isArray(items) || !items.length) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const extractItems = (response = {}) => {
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.result?.items)) return response.result.items;
  if (Array.isArray(response?.result)) return response.result;
  return [];
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { offerIds = [], productIds = [], mode = 'price' } = req.body || {};
    const normalizedOffers = Array.isArray(offerIds)
      ? offerIds.filter(Boolean).map(String)
      : [];
    const normalizedProducts = Array.isArray(productIds)
      ? productIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id));

    if (!normalizedOffers.length && !normalizedProducts.length) {
      return res.status(400).json({ error: 'Передайте offerIds или productIds' });
    }

    if (mode !== 'price' && mode !== 'net_price') {
      return res.status(400).json({ error: 'mode должен быть price или net_price' });
    }

    const { profile } = await resolveProfileFromRequest(req, res);
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const ts = startOfTodayLocal().toISOString();

    const offerChunks = chunkArray(normalizedOffers, 1000);
    const productChunks = chunkArray(normalizedProducts, 1000);
    const maxChunks = Math.max(offerChunks.length, productChunks.length) || 1;

    let totalItems = 0;
    let logged = 0;

    for (let index = 0; index < maxChunks; index++) {
      const offerChunk = offerChunks[index] || [];
      const productChunk = productChunks[index] || [];
      if (!offerChunk.length && !productChunk.length) continue;

      const response = await ozon.getProductInfoPrices({
        offer_ids: offerChunk,
        product_ids: productChunk,
        limit: Math.max(offerChunk.length + productChunk.length, 1)
      });

      const items = extractItems(response);
      totalItems += items.length;

      for (const item of items) {
        const sku = item?.product_id ?? item?.id ?? item?.productId;
        const priceObj = item?.price;
        if (!sku || !priceObj) continue;

        if (mode === 'price') {
          try {
            await appendPriceHistory({
              sku: String(sku),
              priceData: priceObj,
              ts
            });
            logged += 1;
          } catch (writeError) {
            console.error('[price-log] Failed to append price', writeError);
          }
        } else if (mode === 'net_price') {
          const netValue = priceObj?.net_price;
          if (netValue === undefined || netValue === null) {
            continue;
          }
          try {
            await appendNetPriceHistory({
              sku: String(sku),
              netPrice: Number(netValue),
              ts
            });
            logged += 1;
          } catch (writeError) {
            console.error('[price-log] Failed to append net price', writeError);
          }
        }
      }
    }

    return res.status(200).json({
      logged,
      total: totalItems,
      mode
    });
  } catch (error) {
    console.error('[operations/price-log] Failed', error);
    return res.status(500).json({ error: error?.message || 'Failed to log prices' });
  }
}

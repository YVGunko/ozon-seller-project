import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveProfileFromRequest } from '../../../src/server/profileResolver';
import { appendPriceHistory } from '../../../src/server/priceHistoryStore';
import { appendNetPriceHistory } from '../../../src/server/netPriceHistoryStore';
import { popPendingPricesByOffers } from '../../../src/server/pendingPriceStore';
import { popPendingNetPricesByOffers } from '../../../src/server/pendingNetPriceStore';

const extractOfferSkuPairs = (items = []) =>
  items
    .map((item) => {
      const offerId = item?.offer_id ?? item?.offerId;
      const sku = item?.product_id ?? item?.productId ?? item?.id ?? item?.sku;
      if (!offerId || !sku) return null;
      return { offerId: String(offerId), sku: String(sku) };
    })
    .filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { offer_id } = req.query;
    if (!offer_id) {
      res.status(400).json({ error: 'Missing offer_id' });
      return;
    }

    const { profile } = await resolveProfileFromRequest(req, res);
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.getProductInfoList([offer_id]);
    const items =
      Array.isArray(response?.items) && response.items.length
        ? response.items
        : Array.isArray(response?.result?.items)
        ? response.result.items
        : [];

    try {
      const offerSkuPairs = extractOfferSkuPairs(items);
      if (offerSkuPairs.length) {
        const resolvedPrices = await popPendingPricesByOffers({
          offerSkuPairs,
          profileId: profile?.id ?? null
        });
        await Promise.all(
          resolvedPrices.map((record) =>
            appendPriceHistory({
              sku: record.sku,
              price: record.price,
              priceData: record.data,
              ts: record.ts
            })
          )
        );

        const resolvedNet = await popPendingNetPricesByOffers({
          offerSkuPairs,
          profileId: profile?.id ?? null
        });
        await Promise.all(
          resolvedNet.map((record) =>
            appendNetPriceHistory({
              sku: record.sku,
              netPrice: record.net_price,
              ts: record.ts
            })
          )
        );
      }
    } catch (applyError) {
      console.error('[info-list] Failed to resolve pending prices', applyError);
    }

    res.status(200).json({
      items,
      raw: response
    });
  } catch (error) {
    console.error('❌ /api/products/info-list error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch product info list'
    });
  }
}

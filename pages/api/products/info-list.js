import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';
import { appendPriceHistory } from '../../../src/server/priceHistoryStore';
import { appendNetPriceHistory } from '../../../src/server/netPriceHistoryStore';
import { popPendingPricesByOffers } from '../../../src/server/pendingPriceStore';
import { popPendingNetPricesByOffers } from '../../../src/server/pendingNetPriceStore';
import { withServerContext } from '../../../src/server/apiUtils';

const extractOfferSkuPairs = (items = []) =>
  items
    .map((item) => {
      const offerId = item?.offer_id ?? item?.offerId;
      const sku = item?.product_id ?? item?.productId ?? item?.id ?? item?.sku;
      if (!offerId || !sku) return null;
      return { offerId: String(offerId), sku: String(sku) };
    })
    .filter(Boolean);

async function handler(req, res /* ctx */) {
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

    const { profile } = await resolveServerContext(req, res, { requireProfile: true });
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

    return res.status(200).json({
      items,
      raw: response
    });
  } catch (error) {
    console.error('❌ /api/products/info-list error:', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Failed to fetch product info list'
    });
  }
}

export default withServerContext(handler, { requireAuth: true });

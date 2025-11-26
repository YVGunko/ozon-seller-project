import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';
import { extractImportStatusItems } from '../../../src/utils/importStatus';
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { taskId } = req.body || {};
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const { profile } = await resolveServerContext(req, res, { requireProfile: true });
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.getProductImportStatus(taskId);

    try {
      const items = extractImportStatusItems(response);
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
      console.error('[products/import-status] Failed to resolve pending prices', applyError);
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('[products/import-status] Failed', error);
    return res.status(500).json({
      error: error?.message || 'Failed to fetch import status',
      details: error?.data || null
    });
  }
}

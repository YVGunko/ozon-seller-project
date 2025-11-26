import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';
import {
  appendPriceHistory,
  getPriceHistory
} from '../../../src/server/priceHistoryStore';
import { addPendingPriceRecords } from '../../../src/server/pendingPriceStore';
import {
  appendNetPriceHistory,
  getNetPriceHistory
} from '../../../src/server/netPriceHistoryStore';
import { addPendingNetPriceRecords } from '../../../src/server/pendingNetPriceStore';

const normalizePrice = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.');
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractPriceEntries = (items = []) =>
  items
    .map((item) => {
      const offerId = item?.offer_id ?? item?.offerId;
      const price = normalizePrice(item?.price);
      if (!offerId || price === null) return null;
      return { offerId: String(offerId), price };
    })
    .filter(Boolean);

const extractNetPriceEntries = (items = []) =>
  items
    .map((item) => {
      const offerId = item?.offer_id ?? item?.offerId;
      const netPrice = normalizePrice(item?.net_price ?? item?.netPrice);
      if (!offerId || netPrice === null) return null;
      return { offerId: String(offerId), netPrice };
    })
    .filter(Boolean);

const extractInfoItems = (response = {}) => {
  if (Array.isArray(response?.result?.items)) return response.result.items;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.result)) return response.result;
  return [];
};

const buildOfferSkuMap = (infoItems = []) => {
  const map = new Map();
  infoItems.forEach((item) => {
    const offerId = item?.offer_id ?? item?.offerId;
    const sku = item?.id ?? item?.product_id ?? item?.productId ?? item?.sku;
    if (offerId && sku) {
      map.set(String(offerId), String(sku));
    }
  });
  return map;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Не переданы товары для импорта' });
    }

    const { profile } = await resolveServerContext(req, res, { requireProfile: true });
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);

    const priceEntries = extractPriceEntries(items);
    const netPriceEntries = extractNetPriceEntries(items);
    let offerSkuMap = new Map();
    const allTrackedOffers = Array.from(
      new Set([...priceEntries, ...netPriceEntries].map((entry) => entry.offerId))
    );

    if (allTrackedOffers.length) {
      try {
        const infoResponse = await ozon.getProductInfoList(allTrackedOffers);
        offerSkuMap = buildOfferSkuMap(extractInfoItems(infoResponse));
      } catch (error) {
        console.error('[products/import] Failed to fetch product info for price history', error);
      }
    }

    for (const entry of priceEntries) {
      const sku = offerSkuMap.get(entry.offerId);
      if (!sku) continue;
      try {
        const history = await getPriceHistory(sku);
        const lastPrice = history?.[0]?.price;
        if (lastPrice !== entry.price) {
          await appendPriceHistory({ sku, price: entry.price });
        }
      } catch (error) {
        console.error('[products/import] Failed to append price history', { sku, error });
      }
    }

    for (const entry of netPriceEntries) {
      const sku = offerSkuMap.get(entry.offerId);
      if (!sku) continue;
      try {
        const history = await getNetPriceHistory(sku);
        const lastNet = history?.[0]?.net_price;
        if (lastNet !== entry.netPrice) {
          await appendNetPriceHistory({ sku, netPrice: entry.netPrice });
        }
      } catch (error) {
        console.error('[products/import] Failed to append net price history', { sku, error });
      }
    }

    const sanitizedItems = items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const copy = { ...item };
      if ('net_price' in copy) {
        delete copy.net_price;
      }
      if ('netPrice' in copy) {
        delete copy.netPrice;
      }
      return copy;
    });

    const response = await ozon.createProductsBatch(sanitizedItems);

    const pendingEntries = priceEntries
      .filter((entry) => !offerSkuMap.has(entry.offerId))
      .map((entry) => ({
        offer_id: entry.offerId,
        price: entry.price,
        ts: new Date().toISOString(),
        task_id: response?.result?.task_id ?? response?.task_id ?? null,
        profileId: profile?.id ?? null
      }));

    if (pendingEntries.length) {
      try {
        await addPendingPriceRecords(pendingEntries);
      } catch (error) {
        console.error('[products/import] Failed to add pending price records', error);
      }
    }

    const pendingNetEntries = netPriceEntries
      .filter((entry) => !offerSkuMap.has(entry.offerId))
      .map((entry) => ({
        offer_id: entry.offerId,
        net_price: entry.netPrice,
        ts: new Date().toISOString(),
        task_id: response?.result?.task_id ?? response?.task_id ?? null,
        profileId: profile?.id ?? null
      }));

    if (pendingNetEntries.length) {
      try {
        await addPendingNetPriceRecords(pendingNetEntries);
      } catch (error) {
        console.error('[products/import] Failed to add pending net price records', error);
      }
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('[products/import] Failed', error);
    return res.status(500).json({
      error: error?.message || 'Failed to import products',
      details: error?.data || null
    });
  }
}

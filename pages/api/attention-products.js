import { OzonApiService } from '../../src/services/ozon-api';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 1000;
const DEFAULT_MAX_PAGES = 10;
const HARD_MAX_PAGES = 50;
const INFO_CHUNK_SIZE = 50;

const normalizeBooleanFilter = (value) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
};

const matchesBooleanFilter = (value, filterValue) => {
  if (filterValue === null) return true;
  return Boolean(value) === filterValue;
};

const extractProductInfoItems = (response = {}) => {
  if (Array.isArray(response?.result?.items)) {
    return response.result.items;
  }
  if (Array.isArray(response?.items)) {
    return response.items;
  }
  return [];
};

const normalizeMediaArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (entry === undefined || entry === null) return null;
      return String(entry).trim();
    })
    .filter((entry) => !!entry);
};

const enrichItemsWithProductInfo = async ({ items = [], ozon, chunkSize = INFO_CHUNK_SIZE }) => {
  if (!items.length) {
    return { items, infoChunks: 0 };
  }

  const offerIds = Array.from(
    new Set(
      items
        .map((item) => item?.offer_id ?? item?.offerId ?? null)
        .filter(Boolean)
        .map((offerId) => String(offerId))
    )
  );

  if (!offerIds.length) {
    return { items, infoChunks: 0 };
  }

  const infoMap = new Map();
  let infoChunks = 0;

  for (let index = 0; index < offerIds.length; index += chunkSize) {
    const chunk = offerIds.slice(index, index + chunkSize);
    if (!chunk.length) continue;
    try {
      const response = await ozon.getProductInfoList(chunk);
      infoChunks += 1;
      const infoItems = extractProductInfoItems(response);
      infoItems.forEach((infoItem) => {
        const offerId = infoItem?.offer_id ?? infoItem?.offerId;
        if (!offerId) return;
        infoMap.set(String(offerId), infoItem);
      });
    } catch (error) {
      console.error('[AttentionProducts] Failed to fetch product info chunk', {
        chunk,
        error: error?.message || error
      });
    }
  }

  const enrichedItems = items.map((item) => {
    const offerId = item?.offer_id ? String(item.offer_id) : '';
    const infoEntry = offerId ? infoMap.get(offerId) : null;
    const barcodesFromInfo = normalizeMediaArray(infoEntry?.barcodes);
    const imagesFromInfo = normalizeMediaArray(infoEntry?.images);
    return {
      ...item,
      barcodes: barcodesFromInfo,
      images: imagesFromInfo,
      has_barcodes: barcodesFromInfo.length > 0,
      has_images: imagesFromInfo.length > 0
    };
  });

  return { items: enrichedItems, infoChunks };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      profile,
      filters = {},
      limit = DEFAULT_LIMIT,
      maxPages = DEFAULT_MAX_PAGES
    } = req.body || {};

    if (!profile) {
      return res.status(400).json({ error: 'Missing OZON profile' });
    }

    const { ozon_client_id, ozon_api_key } = profile;
    if (!ozon_client_id || !ozon_api_key) {
      return res
        .status(400)
        .json({ error: 'Profile must include ozon_client_id and ozon_api_key' });
    }

    const requestLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT));
    const pagesLimit = Math.max(
      1,
      Math.min(Number(maxPages) || DEFAULT_MAX_PAGES, HARD_MAX_PAGES)
    );

    const ozon = new OzonApiService(ozon_api_key, ozon_client_id);

    let lastId = '';
    let page = 0;
    const collectedItems = [];
    const startedAt = Date.now();

    while (page < pagesLimit) {
      page += 1;
      const response = await ozon.getProducts({
        limit: requestLimit,
        last_id: lastId,
        filter: { visibility: 'ALL' }
      });

      const items = response?.result?.items || [];
      collectedItems.push(...items);
      lastId = response?.result?.last_id || '';

      if (!lastId || items.length === 0) {
        break;
      }
    }

    const normalizedFilters = {
      archived: normalizeBooleanFilter(filters.archived),
      has_fbo_stocks: normalizeBooleanFilter(filters.has_fbo_stocks),
      has_fbs_stocks: normalizeBooleanFilter(filters.has_fbs_stocks)
    };

    const filteredItems = collectedItems.filter((item) => {
      if (!matchesBooleanFilter(item?.archived, normalizedFilters.archived)) {
        return false;
      }
      if (!matchesBooleanFilter(item?.has_fbo_stocks, normalizedFilters.has_fbo_stocks)) {
        return false;
      }
      if (!matchesBooleanFilter(item?.has_fbs_stocks, normalizedFilters.has_fbs_stocks)) {
        return false;
      }
      return true;
    });

    const { items: enrichedItems, infoChunks } = await enrichItemsWithProductInfo({
      items: filteredItems,
      ozon
    });

    return res.status(200).json({
      items: enrichedItems,
      totalFetched: collectedItems.length,
      matchedCount: enrichedItems.length,
      pagesFetched: page,
      hasMore: Boolean(lastId),
      durationMs: Date.now() - startedAt,
      limit: requestLimit,
      infoChunks
    });
  } catch (error) {
    console.error('[AttentionProducts] Failed to collect products', error);
    return res.status(500).json({
      error: 'Failed to collect products from OZON API',
      details: error.message
    });
  }
}

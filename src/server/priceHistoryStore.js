import { list, put } from '@vercel/blob';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PREFIX = 'price-history';
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_ENTRIES = 400;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const memoryStore = new Map();

const buildKey = (sku) => {
  if (!sku) {
    throw new Error('SKU is required for price history');
  }
  const normalized = String(sku).trim();
  if (!normalized) {
    throw new Error('SKU is required for price history');
  }
  return `${PREFIX}/${normalized}.json`;
};

const sanitizeEntries = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const ts = item?.ts || item?.date;
      const parsedTs = ts ? Date.parse(ts) : NaN;
      if (Number.isNaN(parsedTs)) {
        return null;
      }
      const data =
        item?.data && typeof item.data === 'object'
          ? item.data
          : item?.price && typeof item.price === 'object'
          ? item.price
          : null;
      const priceValue =
        typeof item?.price === 'number'
          ? item.price
          : typeof item?.value === 'number'
          ? item.value
          : typeof data?.price === 'number'
          ? data.price
          : null;
      const numericPrice = Number(priceValue);
      return {
        ts: new Date(parsedTs).toISOString(),
        price: Number.isFinite(numericPrice) ? numericPrice : null,
        data: data || (Number.isFinite(numericPrice) ? { price: numericPrice } : null)
      };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
};

const readFromBlob = async (key) => {
  const { blobs = [] } = await list({ token: BLOB_TOKEN, prefix: key, limit: 1 });
  const blob = blobs.find((entry) => entry.pathname === key);
  if (!blob) {
    return [];
  }
  const response = await fetch(blob.downloadUrl || blob.url);
  if (!response.ok) {
    return [];
  }
  try {
    const data = await response.json();
    return sanitizeEntries(data);
  } catch (error) {
    console.error('[priceHistory] Failed to parse blob JSON', error);
    return [];
  }
};

const writeToBlob = async (key, entries) => {
  const payload = JSON.stringify(entries ?? []);
  await put(key, payload, {
    token: BLOB_TOKEN,
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false
  });
};

export const getPriceHistory = async (sku) => {
  const key = buildKey(sku);
  if (!BLOB_TOKEN) {
    return memoryStore.get(key) || [];
  }
  try {
    return await readFromBlob(key);
  } catch (error) {
    console.error('[priceHistory] Failed to read from blob', error);
    return memoryStore.get(key) || [];
  }
};

export const getRecentPriceHistory = async (sku, windowDays = DEFAULT_WINDOW_DAYS) => {
  const history = await getPriceHistory(sku);
  const cutoff = Date.now() - Math.max(windowDays, 1) * MS_IN_DAY;
  return history.filter((entry) => Date.parse(entry.ts) >= cutoff);
};

export const appendPriceHistory = async ({
  sku,
  price,
  priceData,
  data,
  ts = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS,
  maxEntries = MAX_ENTRIES
}) => {
  const key = buildKey(sku);
  const timestamp = new Date(ts);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('Invalid timestamp for price history');
  }
  const payloadData = data || priceData;
  const numericPriceFromData =
    payloadData && typeof payloadData === 'object' && typeof payloadData.price === 'number'
      ? Number(payloadData.price)
      : null;
  const numericPrice =
    typeof price === 'number'
      ? Number(price)
      : numericPriceFromData !== null
      ? numericPriceFromData
      : price !== undefined && price !== null
      ? Number(price)
      : null;

  const entry = {
    ts: timestamp.toISOString(),
    price: Number.isFinite(numericPrice) ? numericPrice : null,
    data:
      payloadData && typeof payloadData === 'object'
        ? payloadData
        : Number.isFinite(numericPrice)
        ? { price: numericPrice }
        : null
  };

  if (entry.price === null && !entry.data) {
    throw new Error('Invalid price payload for price history');
  }

  const cutoff = Date.now() - Math.max(retentionDays, 1) * MS_IN_DAY;
  const existing = await getPriceHistory(sku);
  const updated = [entry, ...existing]
    .filter((item) => Date.parse(item.ts) >= cutoff)
    .slice(0, maxEntries || existing.length + 1);

  if (!BLOB_TOKEN) {
    memoryStore.set(key, updated);
    return updated;
  }

  try {
    await writeToBlob(key, updated);
    memoryStore.set(key, updated);
  } catch (error) {
    console.error('[priceHistory] Failed to write to blob', error);
    memoryStore.set(key, updated);
  }

  return updated;
};

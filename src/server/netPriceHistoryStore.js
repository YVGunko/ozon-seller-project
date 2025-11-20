import { list, put } from '@vercel/blob';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PREFIX = 'net-price';
const DEFAULT_RETENTION_DAYS = null; // бессрочно
const DEFAULT_WINDOW_DAYS = 90;
const MAX_ENTRIES = 400;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const memoryStore = new Map();

const buildKey = (sku) => {
  if (!sku) {
    throw new Error('SKU is required for net price history');
  }
  const normalized = String(sku).trim();
  if (!normalized) {
    throw new Error('SKU is required for net price history');
  }
  return `${PREFIX}/${normalized}.json`;
};

const sanitizeEntries = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const ts = item?.ts || item?.date;
      const value = item?.net_price ?? item?.price ?? item?.value;
      const parsedTs = ts ? Date.parse(ts) : NaN;
      const parsedValue = Number(value);
      if (Number.isNaN(parsedTs) || Number.isNaN(parsedValue)) {
        return null;
      }
      return { ts: new Date(parsedTs).toISOString(), net_price: parsedValue };
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
    console.error('[netPrice] Failed to parse blob JSON', error);
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

export const getNetPriceHistory = async (sku) => {
  const key = buildKey(sku);
  if (!BLOB_TOKEN) {
    return memoryStore.get(key) || [];
  }
  try {
    return await readFromBlob(key);
  } catch (error) {
    console.error('[netPrice] Failed to read from blob', error);
    return memoryStore.get(key) || [];
  }
};

export const getRecentNetPriceHistory = async (sku, windowDays = DEFAULT_WINDOW_DAYS) => {
  const history = await getNetPriceHistory(sku);
  const cutoff = Date.now() - Math.max(windowDays, 1) * MS_IN_DAY;
  return history.filter((entry) => Date.parse(entry.ts) >= cutoff);
};

export const appendNetPriceHistory = async ({
  sku,
  netPrice,
  ts = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS,
  maxEntries = MAX_ENTRIES
}) => {
  const key = buildKey(sku);
  const timestamp = new Date(ts);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('Invalid timestamp for net price history');
  }
  const value = Number(netPrice);
  if (!Number.isFinite(value)) {
    throw new Error('Invalid net price value');
  }
  const entry = { ts: timestamp.toISOString(), net_price: value };

  const cutoff = Date.now() - Math.max(retentionDays, 1) * MS_IN_DAY;
  const existing = await getNetPriceHistory(sku);
  const filtered = [entry, ...existing].filter((item) => {
    if (!Number.isFinite(retentionDays) || retentionDays === null) {
      return true;
    }
    return Date.parse(item.ts) >= cutoff;
  });
  const updated =
    Number.isFinite(maxEntries) && maxEntries > 0 ? filtered.slice(0, maxEntries) : filtered;

  if (!BLOB_TOKEN) {
    memoryStore.set(key, updated);
    return updated;
  }

  try {
    await writeToBlob(key, updated);
    memoryStore.set(key, updated);
  } catch (error) {
    console.error('[netPrice] Failed to write to blob', error);
    memoryStore.set(key, updated);
  }

  return updated;
};

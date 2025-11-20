import { list, put } from '@vercel/blob';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PENDING_KEY = 'net-price/pending.json';
const PENDING_RETENTION_DAYS = 180;
const MAX_PENDING = 1000;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const memoryPending = [];

const normalizeRecord = (entry = {}) => {
  const offerId = entry.offer_id ?? entry.offerId;
  const netPrice = Number(entry.net_price ?? entry.price ?? entry.value);
  const taskId = entry.task_id ?? entry.taskId ?? null;
  const profileId = entry.profileId ?? entry.profile_id ?? null;
  const tsValue = entry.ts ?? entry.date;
  const ts = tsValue ? Date.parse(tsValue) : Date.now();

  if (!offerId || Number.isNaN(netPrice) || Number.isNaN(ts)) {
    return null;
  }

  return {
    offer_id: String(offerId),
    net_price: netPrice,
    task_id: taskId || null,
    profileId: profileId ? String(profileId) : null,
    ts: new Date(ts).toISOString()
  };
};

const readPendingFromBlob = async () => {
  const { blobs = [] } = await list({ token: BLOB_TOKEN, prefix: PENDING_KEY, limit: 1 });
  const blob = blobs.find((item) => item.pathname === PENDING_KEY);
  if (!blob) {
    return [];
  }

  const response = await fetch(blob.downloadUrl || blob.url);
  if (!response.ok) {
    return [];
  }

  try {
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.map(normalizeRecord).filter(Boolean);
  } catch (error) {
    console.error('[pendingNetPrice] Failed to parse JSON', error);
    return [];
  }
};

const writePendingToBlob = async (records) => {
  const payload = JSON.stringify(records ?? []);
  await put(PENDING_KEY, payload, {
    token: BLOB_TOKEN,
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false
  });
};

const persistPendingRecords = async (records) => {
  if (!BLOB_TOKEN) {
    memoryPending.length = 0;
    memoryPending.push(...records);
    return records;
  }

  try {
    await writePendingToBlob(records);
    memoryPending.length = 0;
    memoryPending.push(...records);
  } catch (error) {
    console.error('[pendingNetPrice] Write failed', error);
    memoryPending.length = 0;
    memoryPending.push(...records);
  }
  return records;
};

export const readPendingNetPrices = async () => {
  if (!BLOB_TOKEN) {
    return [...memoryPending];
  }
  try {
    const records = await readPendingFromBlob();
    return records;
  } catch (error) {
    console.error('[pendingNetPrice] Read failed', error);
    return [...memoryPending];
  }
};

export const addPendingNetPriceRecords = async (records = []) => {
  const normalizedNew = records.map(normalizeRecord).filter(Boolean);
  if (!normalizedNew.length) {
    return await readPendingNetPrices();
  }

  const retentionCutoff = Date.now() - PENDING_RETENTION_DAYS * MS_IN_DAY;
  const existing = await readPendingNetPrices();

  const merged = [...normalizedNew, ...existing]
    .filter((record) => Date.parse(record.ts) >= retentionCutoff)
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

  const deduped = [];
  const seen = new Set();
  for (const record of merged) {
    const key = `${record.profileId || 'default'}::${record.offer_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
    if (deduped.length >= MAX_PENDING) break;
  }

  return persistPendingRecords(deduped);
};

export const popPendingNetPricesByOffers = async ({
  offerSkuPairs = [],
  profileId = null
} = {}) => {
  if (!Array.isArray(offerSkuPairs) || !offerSkuPairs.length) {
    return [];
  }

  const normalizedPairs = offerSkuPairs
    .map((entry) => {
      const offerId = entry?.offer_id ?? entry?.offerId;
      const sku = entry?.sku ?? entry?.product_id ?? entry?.productId ?? entry?.id;
      const profile = entry?.profileId ?? entry?.profile_id ?? profileId ?? null;
      if (!offerId || !sku) return null;
      return {
        offerId: String(offerId),
        sku: String(sku),
        profileId: profile ? String(profile) : null
      };
    })
    .filter(Boolean);

  if (!normalizedPairs.length) {
    return [];
  }

  const pending = await readPendingNetPrices();
  const resolved = [];
  const remaining = [];

  pending.forEach((record) => {
    const match = normalizedPairs.find((pair) => {
      if (pair.offerId !== record.offer_id) return false;
      if (record.profileId && pair.profileId && record.profileId !== pair.profileId) {
        return false;
      }
      if (record.profileId && pair.profileId === null) {
        return false;
      }
      if (!record.profileId && pair.profileId && profileId && pair.profileId !== String(profileId)) {
        return false;
      }
      return true;
    });

    if (match) {
      resolved.push({
        ...record,
        sku: match.sku,
        profileId: match.profileId ?? record.profileId
      });
    } else {
      remaining.push(record);
    }
  });

  if (resolved.length) {
    await persistPendingRecords(remaining);
  }

  return resolved;
};

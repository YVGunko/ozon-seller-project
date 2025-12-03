import { BlobKV } from '../services/vercelBlobClient';

const MAX_LOGS = 500;
const MAX_PAGE_LIMIT = 200;
const DEFAULT_PAGE_LIMIT = 50;
const BLOB_KEY = 'request-logs.json';

const buildLogEntry = (entry = {}) => ({
  offer_id: entry.offer_id || '',
  product_id: entry.product_id || '',
  endpoint: entry.endpoint || '',
  method: entry.method || '',
  status: entry.status ?? null,
  duration_ms: entry.duration_ms ?? null,
  error_message: entry.error_message || null,
  barcode: entry.barcode || null,
  barcode_error: entry.barcode_error || null,
  user_id: entry.user_id || 'anonymous',
  enterprise_id: entry.enterprise_id || null,
  seller_id: entry.seller_id || null,
  task_id: entry.task_id || null,
  timestamp: entry.timestamp || new Date().toISOString()
});

const memoryStore = [];

const getStorage = () => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }
  return new BlobKV(process.env.BLOB_READ_WRITE_TOKEN, BLOB_KEY);
};

const readAllLogs = async () => {
  const storage = getStorage();
  if (!storage) {
    return memoryStore;
  }
  const logs = await storage.readJSON([]);
  if (Array.isArray(logs)) {
    return logs;
  }
  return [];
};

export const addRequestLog = async (entry = {}) => {
  const logEntry = buildLogEntry(entry);
  const storage = getStorage();
  if (!storage) {
    memoryStore.unshift(logEntry);
    if (memoryStore.length > MAX_LOGS) {
      memoryStore.length = MAX_LOGS;
    }
    return;
  }

  try {
    const logs = (await storage.readJSON([])) || [];
    const updated = [logEntry, ...logs].slice(0, MAX_LOGS);
    await storage.writeJSON(updated);
  } catch (error) {
    console.error('Blob log write failed, falling back to memory store:', error);
    memoryStore.unshift(logEntry);
    if (memoryStore.length > MAX_LOGS) {
      memoryStore.length = MAX_LOGS;
    }
  }
};

const parseDateBoundary = (value, endOfDay = false) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date.getTime();
};

export const getRequestLogs = async (options = {}) => {
  const {
    cursor = 0,
    limit = DEFAULT_PAGE_LIMIT,
    offerId = '',
    dateFrom = '',
    dateTo = ''
  } = options || {};

  const allLogs = await readAllLogs();
  const offerQuery = (offerId || '').trim().toLowerCase();
  const fromTs = parseDateBoundary(dateFrom, false);
  const toTs = parseDateBoundary(dateTo, true);

  const filtered = allLogs.filter((log) => {
    if (offerQuery) {
      const currentOffer = (log.offer_id || '').toLowerCase();
      if (!currentOffer.includes(offerQuery)) {
        return false;
      }
    }

    if (fromTs || toTs) {
      const ts = Date.parse(log.timestamp || '');
      const isValid = !Number.isNaN(ts);
      if (fromTs && (!isValid || ts < fromTs)) {
        return false;
      }
      if (toTs && (!isValid || ts > toTs)) {
        return false;
      }
    }

    return true;
  });

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
  const startIndex = Math.max(parseInt(cursor, 10) || 0, 0);
  const pageItems = filtered.slice(startIndex, startIndex + safeLimit);
  const nextCursor = startIndex + pageItems.length < filtered.length ? startIndex + pageItems.length : null;

  return {
    logs: pageItems,
    total: filtered.length,
    nextCursor
  };
};
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.log('[logs] BLOB token missing, using memory store');
}

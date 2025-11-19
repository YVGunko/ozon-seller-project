import { BlobKV } from '../services/vercelBlobClient';

const MAX_LOGS = 500;
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

export const getRequestLogs = async () => {
  const storage = getStorage();
  if (!storage) {
    return memoryStore;
  }
  try {
    const logs = await storage.readJSON([]);
    if (logs && Array.isArray(logs)) {
      return logs;
    }
    return [];
  } catch (error) {
    console.error('Blob log read failed, returning memory store:', error);
    return memoryStore;
  }
};
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.log('[logs] BLOB token missing, using memory store');
}

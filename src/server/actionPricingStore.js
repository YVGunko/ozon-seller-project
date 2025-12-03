import { BlobKV } from '../services/vercelBlobClient';

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const PREFIX = 'action-settings';

const getStorage = () => {
  if (!BLOB_TOKEN) return null;
  return new BlobKV(BLOB_TOKEN, `${PREFIX}/placeholder.json`); // key overridden per call
};

export const readActionPricing = async (profileId) => {
  if (!profileId) return null;
  const storage = getStorage();
  if (!storage) return null;
  const key = `${PREFIX}/${profileId}.json`;
  try {
    storage.key = key;
    const data = await storage.readJSON(null);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (error) {
    console.error('[actionPricingStore] read failed', error);
    return null;
  }
};

export const writeActionPricing = async (profileId, payload = {}) => {
  if (!profileId) return;
  const storage = getStorage();
  if (!storage) return;
  const key = `${PREFIX}/${profileId}.json`;
  try {
    storage.key = key;
    await storage.writeJSON({
      ...payload,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[actionPricingStore] write failed', error);
  }
};

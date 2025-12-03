import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';
import { canManagePrices } from '../../../src/domain/services/accessControl';
import { withServerContext } from '../../../src/server/apiUtils';

const parseArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

async function handler(req, res /* ctx */) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const source = req.method === 'GET' ? req.query : req.body;
    const offer_ids = parseArray(source.offerIds || source.offer_id);
    const product_idsRaw = parseArray(source.productIds || source.product_id);
    const product_ids = product_idsRaw
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const limit = source.limit ? Number(source.limit) : 100;
    const cursor = source.cursor || '';

    if (!offer_ids.length && !product_ids.length) {
      return res.status(400).json({ error: 'Передайте offer_id или product_id' });
    }

    const { profile, user } = await resolveServerContext(req, res, { requireProfile: true });
    if (!user || !canManagePrices(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const response = await ozon.getProductInfoPrices({
      offer_ids,
      product_ids,
      limit,
      cursor
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error('[products/info-prices] Failed', error);
    return res.status(500).json({
      error: error?.message || 'Failed to fetch product prices'
    });
  }
}

export default withServerContext(handler, { requireAuth: true });

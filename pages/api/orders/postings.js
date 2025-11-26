import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';
import { canManageOrders } from '../../../src/domain/services/accessControl';

const normalizeFilterPayload = (payload = {}) => {
  const filter = payload.filter || {};
  const cutoffFrom = filter.cutoff_from || filter.cutoffFrom;
  const cutoffTo = filter.cutoff_to || filter.cutoffTo;
  const deliveringFrom = filter.delivering_date_from || filter.deliveringDateFrom;
  const deliveringTo = filter.delivering_date_to || filter.deliveringDateTo;

  const normalized = {};
  const hasCutoff = cutoffFrom || cutoffTo;
  const hasDelivering = deliveringFrom || deliveringTo;

  if (!hasCutoff && !hasDelivering) {
    throw new Error('Укажите диапазон cutoff или delivering_date');
  }

  if (hasCutoff && hasDelivering) {
    throw new Error('Нельзя одновременно использовать cutoff и delivering_date');
  }

  if (hasCutoff) {
    if (cutoffFrom) normalized.cutoff_from = cutoffFrom;
    if (cutoffTo) normalized.cutoff_to = cutoffTo;
  } else {
    if (deliveringFrom) normalized.delivering_date_from = deliveringFrom;
    if (deliveringTo) normalized.delivering_date_to = deliveringTo;
  }

  return normalized;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { profile, user } = await resolveServerContext(req, res, {
      requireProfile: true
    });

    if (!user || !canManageOrders(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const service = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);

    const filter = normalizeFilterPayload(body);
    const payload = {
      dir: body.dir || 'asc',
      limit: body.limit,
      last_id: body.last_id,
      filter,
      withOptions: body.with || {}
    };

    const data = await service.getFbsUnfulfilledPostings(payload);
    return res.status(200).json(data);
  } catch (error) {
    console.error('❌ /api/orders/postings error:', error);
    const status = error?.statusCode || error?.status || 500;
    const message = error.message || 'Failed to fetch postings';
    return res.status(status).json({ error: message, details: error.data || null });
  }
}

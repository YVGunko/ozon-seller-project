import { addRequestLog, getRequestLogs } from '../../src/server/requestLogStore';
import { withServerContext } from '../../src/server/apiUtils';
import { canViewLogs } from '../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;
  if (req.method === 'GET') {
    try {
      const user = domain.user || auth.user || null;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!canViewLogs(user)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const {
        limit = '50',
        cursor = '0',
        offer_id = '',
        date_from = '',
        date_to = ''
      } = req.query || {};

      const options = {
        limit: limit ? Number(limit) : undefined,
        cursor: cursor ? Number(cursor) : 0,
        offerId: offer_id || '',
        dateFrom: date_from || '',
        dateTo: date_to || ''
      };

      const result = await getRequestLogs(options);
      return res.status(200).json(result);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[api/logs][GET] error', error);
      const status = error.statusCode || 500;
      return res.status(status).json({ error: error.message || 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const entry = req.body || {};
      await addRequestLog(entry);
      return res.status(201).json({ success: true });
    } catch (error) {
      console.error('Failed to append request log:', error);
      return res.status(500).json({ error: 'Unable to append log' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withServerContext(handler, { requireAuth: true });

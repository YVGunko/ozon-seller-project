import { addRequestLog, getRequestLogs } from '../../src/server/requestLogStore';

export default async function handler(req, res) {
  if (req.method === 'GET') {
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

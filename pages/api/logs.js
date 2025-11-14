import { addRequestLog, getRequestLogs } from '../../src/server/requestLogStore';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ logs: getRequestLogs() });
  }

  if (req.method === 'POST') {
    try {
      const entry = req.body || {};
      addRequestLog(entry);
      return res.status(201).json({ success: true });
    } catch (error) {
      console.error('Failed to append request log:', error);
      return res.status(500).json({ error: 'Unable to append log' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

import { addRequestLog, getRequestLogs } from '../../src/server/requestLogStore';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const logs = await getRequestLogs();
    return res.status(200).json({ logs });
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

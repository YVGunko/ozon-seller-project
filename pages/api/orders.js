// pages/api/orders.js
import { OzonApiService } from '../../src/services/ozon-api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = new OzonApiService(
      process.env.OZON_API_KEY,
      process.env.OZON_CLIENT_ID
    );

    const orders = await client.getOrders();
    res.status(200).json(orders);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}
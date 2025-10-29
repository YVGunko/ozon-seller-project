import { OzonApiService } from '../../../src/services/ozon-api';

export default async function handler(req, res) {
  console.log('🔍 API Route /api/products/attributes called');
  
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { offer_id } = req.body;
    
    if (!offer_id) {
      return res.status(400).json({ error: 'offer_id is required' });
    }

    console.log('🔑 Environment variables check:');
    console.log('OZON_CLIENT_ID exists:', !!process.env.OZON_CLIENT_ID);
    console.log('OZON_API_KEY exists:', !!process.env.OZON_API_KEY);

    if (!process.env.OZON_API_KEY || !process.env.OZON_CLIENT_ID) {
      throw new Error('Missing OZON API credentials in environment variables');
    }

    const service = new OzonApiService(
      process.env.OZON_API_KEY,
      process.env.OZON_CLIENT_ID
    );
    
    console.log(`🔄 Fetching attributes for offer: ${offer_id}`);
    const attributes = await service.getProductAttributes(offer_id);
    console.log('✅ Attributes fetched successfully');
    
    res.status(200).json(attributes);
  } catch (error) {
    console.error('❌ API Error details:', error);
    console.error('❌ Error message:', error.message);
    
    res.status(500).json({ 
      error: 'Failed to fetch product attributes',
      details: error.message 
    });
  }
}
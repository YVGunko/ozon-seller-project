import { OzonApiService } from '../../../src/services/ozon-api';

export default async function handler(req, res) {
  console.log('🔍 API Route /api/products/copy called');
  
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { source_offer_id, new_offer_id, modifications } = req.body;
    
    if (!source_offer_id || !new_offer_id) {
      return res.status(400).json({ error: 'source_offer_id and new_offer_id are required' });
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
    
    console.log(`🔄 Copying product from ${source_offer_id} to ${new_offer_id}`);
    console.log('📝 Modifications:', modifications);
    
    const result = await service.copyProduct(source_offer_id, new_offer_id, modifications);
    console.log('✅ Product copied successfully');
    
    res.status(200).json(result);
  } catch (error) {
    console.error('❌ API Error details:', error);
    console.error('❌ Error message:', error.message);
    
    res.status(500).json({ 
      error: 'Failed to copy product',
      details: error.message 
    });
  }
}
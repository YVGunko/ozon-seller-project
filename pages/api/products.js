import { OzonApiService } from '../../src/services/ozon-api';

export default async function handler(req, res) {
  console.log('🔍 API Route /api/products called');
  
  if (req.method !== 'GET') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
    
    // const { limit, last_id, offer_ids, product_ids } = req.query;
    const { limit, last_id, offer_id } = req.query;
    
    console.log('🔄 Fetching products from OZON API...');
    console.log('📋 Query parameters:', { limit, last_id, offer_id });
    
    // Парсим query параметры
    const options = {
      limit: limit ? parseInt(limit) : 20,
      last_id: last_id || "",
      filter: {
        visibility: "ALL"
      }
    };

    // Добавляем фильтр по offer_id если указан
    if (offer_id) {
      options.filter.offer_id = Array.isArray(offer_id) ? offer_id : [offer_id];
    }
    
/*     if (product_ids) {
      options.filter.product_id = Array.isArray(product_ids) ? product_ids : [product_ids];
    } */

    const products = await service.getProducts(options);
    console.log('✅ Products fetched successfully');
    
    res.status(200).json(products);
  } catch (error) {
    console.error('❌ API Error details:', error);
    console.error('❌ Error message:', error.message);
    
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: error.message 
    });
  }
}
import { OzonApiService } from '../../src/services/ozon-api';

export default async function handler(req, res) {
  // Обрабатываем CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 20, last_id, offer_id, profile: profileData } = req.query;

    let clientId, apiKey;

    // 🔥 ВЫНЕСИТЕ СОЗДАНИЕ options ВНЕ БЛОКА if
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

    if (profileData) {
      console.log(`🔍 Raw profileData:`, profileData);

      try {
        let profileJson = profileData;
        try {
          profileJson = decodeURIComponent(profileData);
        } catch (e) {
          console.log('Profile data already decoded');
        }

        const profile = JSON.parse(profileJson);
        clientId = profile.ozon_client_id;
        apiKey = profile.ozon_api_key;

        console.log(`✅ Using profile: ${profile.name}`);
        console.log(`🔑 Extracted - ClientID: ${clientId}, API Key: ${apiKey ? '***' + apiKey.slice(-4) : 'none'}`);

      } catch (error) {
        console.error('❌ Error parsing profile data:', error);
        return res.status(400).json({ error: 'Invalid profile data: ' + error.message });
      }
    } else {
      clientId = process.env.OZON_CLIENT_ID;
      apiKey = process.env.OZON_API_KEY;
      console.log('ℹ️ Using default profile from environment variables');
    }

    // Проверка credentials
    console.log(`🔍 Final check - ClientID: "${clientId}", API Key: "${apiKey ? '***' + apiKey.slice(-4) : 'none'}"`);

    if (!clientId || !apiKey) {
      console.log('❌ CREDENTIALS MISSING - ClientID:', !!clientId, 'API Key:', !!apiKey);
      return res.status(400).json({
        error: 'OZON API credentials are required',
        details: {
          hasClientId: !!clientId,
          hasApiKey: !!apiKey,
          profileDataReceived: !!profileData
        }
      });
    }

    console.log('🔧 === API HANDLER DEBUG ===');
    console.log('📨 Incoming request query:', req.query);
    console.log('🔐 Extracted credentials:', {
      clientId: clientId,
      apiKey: apiKey ? '***' + apiKey.slice(-4) : 'MISSING'
    });
    console.log('🚀 Calling OzonApiService...');
    const service = new OzonApiService(apiKey, clientId);
    console.log('🛠️ OzonApiService created successfully');

    console.log('🚀 Calling getProducts with options:', options);
    
    // 🔥 ИСПРАВЬТЕ ВЫЗОВ МЕТОДА - убираем parseInt для объекта
    const products = await service.getProducts(options);

    console.log('✅ Products fetched successfully');
    res.status(200).json(products);

  } catch (error) {
    console.error('❌ Error in /api/products:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({
      error: error.message,
      details: 'Check server console for more information'
    });
  }
}
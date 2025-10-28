export class OzonApiService {
  constructor(apiKey, clientId) {
    if (!apiKey || !clientId) {
      throw new Error('OZON API credentials are required');
    }
    
    this.apiKey = apiKey;
    this.clientId = clientId;
    this.baseURL = 'https://api-seller.ozon.ru';
  }

  async makeRequest(endpoint, body = {}) {
    console.log(`🔄 Making request to: ${endpoint}`);
    console.log('📦 Request body:', JSON.stringify(body, null, 2));
    
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Client-Id': this.clientId,
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      console.log(`📊 Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error ${response.status}:`, errorText);
        throw new Error(`OZON API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Request successful');
      return data;
    } catch (error) {
      console.error('❌ Fetch error:', error.message);
      throw error;
    }
  }

  // Метод для получения заказов (если нужен)
  async getOrders() {
    return this.makeRequest('/v2/order/list', {
      filter: {},
      limit: 10,
      sort_by: 'created_at',
      sort_order: 'desc'
    });
  }

  // НОВЫЙ МЕТОД: Получение списка продуктов
  async getProducts(options = {}) {
    const body = {
      filter: {
        offer_id: options.offer_ids || [],
        product_id: options.product_ids || [],
        visibility: options.visibility || "ALL"
      },
      last_id: options.last_id || "",
      limit: options.limit || 100
    };

    return this.makeRequest('/v3/product/list', body);
  }

  // Упрощенный метод для быстрого получения продуктов
  async getSimpleProducts(limit = 10) {
    return this.getProducts({
      filter: {
        visibility: "ALL"
      },
      limit: limit
    });
  }
}
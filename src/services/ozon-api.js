export class OzonApiService {
  constructor(apiKey, clientId) {
    this.apiKey = apiKey;
    this.clientId = clientId;
    this.baseURL = 'https://api-seller.ozon.ru';
  }

  async makeRequest(endpoint, body = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-Id': this.clientId,
        'Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      throw new Error(`OZON API Error: ${response.status}`);
    }
    
    return response.json();
  }

  // Конкретные методы API
  async getOrders() {
    return this.makeRequest('/v2/order/list', {
      filter: {},
      limit: 10
    });
  }
}
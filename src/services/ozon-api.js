// src/services/ozon-api.js
/* используется только на сервере, обращается к https://api-seller.ozon.ru*/
import { BaseHttpClient } from './base-http-client.js';

export class OzonApiService extends BaseHttpClient {
  constructor(apiKey, clientId) {
    super('https://api-seller.ozon.ru');
    if (!apiKey || !clientId) {
      throw new Error('OZON API credentials are required.');
    }
    this.apiKey = apiKey;
    this.clientId = clientId;
  }

  async ozonRequest(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      headers: {
        'Client-Id': this.clientId,
        'Api-Key': this.apiKey
      },
      body
    });
  }

  // === Основные методы ===
  async getProducts(options = {}) {
    const body = {
      filter: {
        offer_id: options.filter?.offer_id || [],
        visibility: options.filter?.visibility || 'ALL'
      },
      limit: options.limit || 20,
      last_id: options.last_id || ''
    };
    return this.ozonRequest('/v3/product/list', body);
  }

  async getProductAttributes(offerId) {
    return this.ozonRequest('/v4/product/info/attributes', {
      filter: { offer_id: [offerId] },
      limit: 1
    });
  }

  async createProduct(productData) {
    return this.ozonRequest('/v2/product/import', {
      items: [productData]
    });
  }

  async createProductsBatch(products) {
    return this.ozonRequest('/v2/product/import', {
      items: products
    });
  }
}

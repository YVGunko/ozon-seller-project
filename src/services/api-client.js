// src/services/api-client.js
import { BaseHttpClient } from './base-http-client';

export class ApiClient extends BaseHttpClient {
  constructor() {
    super('/api'); // клиент обращается к Next API routes
  }

  async requestJson(endpoint, opts = {}) {
    // Обёртка для удобства: если method GET, body игнорируется
    return this.request(endpoint, opts);
  }

  async getProducts(limit = 20, profile = null, extra = {}) {
    const params = new URLSearchParams({ limit: String(limit), ...extra });
    if (profile) params.append('profile', encodeURIComponent(JSON.stringify(profile)));
    return this.requestJson(`/products?${params.toString()}`, { method: 'GET' });
  }

  async importProducts(products, profile) {
    return this.requestJson('/products', {
      method: 'POST',
      body: { action: 'import', products, profile }
    });
  }

  async copyProduct(source_offer_id, new_offer_id, modifications = {}, profile = null) {
    return this.requestJson('/products/copy', {
      method: 'POST',
      body: { source_offer_id, new_offer_id, modifications, profile }
    });
  }

  async getAttributes(offer_id, profile = null) {
    return this.requestJson('/products/attributes', {
      method: 'POST',
      body: { offer_id, profile }
    });
  }

  async importProductsBatch(batches, profile, onProgress = null) {
    const results = [];
    for (let i = 0; i < batches.length; i++) {
      const res = await this.importProducts(batches[i], profile);
      results.push(res);
      if (onProgress) onProgress(i + 1, batches.length);
      if (i < batches.length - 1) await new Promise(r => setTimeout(r, 1000));
    }
    return results;
  }
}

export const apiClient = new ApiClient();

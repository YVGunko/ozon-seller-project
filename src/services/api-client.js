// src/services/api-client.js
/* используется на клиенте, обращается к Next.js backend /api/... */
import { BaseHttpClient } from './base-http-client.js';

export class ApiClient extends BaseHttpClient {
  constructor() {
    super('/api');
  }

  async getProducts(limit = 20, profile = null) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (profile) {
      params.append('profile', encodeURIComponent(JSON.stringify(profile)));
    }
    return this.request(`/products?${params.toString()}`, { method: 'GET' });
  }

  async importProducts(products, profile) {
    return this.request('/import-products', {
      method: 'POST',
      body: { products, profile }
    });
  }

  async importProductsBatch(batches, profile, onProgress = null) {
    const results = [];
    for (let i = 0; i < batches.length; i++) {
      const result = await this.importProducts(batches[i], profile);
      results.push(result);
      if (onProgress) onProgress(i + 1, batches.length);
      if (i < batches.length - 1) await new Promise(r => setTimeout(r, 1000));
    }
    return results;
  }
}

export const apiClient = new ApiClient();

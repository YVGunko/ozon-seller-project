// src/services/ozon-api.js
import { BaseHttpClient } from './base-http-client';

export class OzonApiService extends BaseHttpClient {
  constructor(apiKey, clientId) {
    super('https://api-seller.ozon.ru');
    if (!apiKey || !clientId) {
      throw new Error('OZON API credentials required');
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

  async getProducts(options = {}) {
    const body = {
      filter: {
        offer_id: options.filter?.offer_id || [],
        product_id: options.filter?.product_ids || [],
        visibility: options.filter?.visibility || 'ALL'
      },
      last_id: options.last_id || '',
      limit: options.limit || 20
    };
    return this.ozonRequest('/v3/product/list', body);
  }

  async getProductAttributes(offerId) {
    return this.ozonRequest('/v4/product/info/attributes', {
      filter: { offer_id: Array.isArray(offerId) ? offerId : [offerId] },
      limit: 1
    });
  }

  async createProductsBatch(products) {
    return this.ozonRequest('/v2/product/import', { items: products });
  }

  // copyProduct uses getProductAttributes + createProduct logic from original file
  async copyProduct(sourceOfferId, newOfferId, modifications = {}) {
    const attrs = await this.getProductAttributes(sourceOfferId);
    if (!attrs?.result || !Array.isArray(attrs.result) || attrs.result.length === 0) {
      throw new Error('Source product not found');
    }
    const sourceProduct = attrs.result[0];

    // Prepare minimal product payload — you can expand mapping as needed
    const newProduct = {
      offer_id: newOfferId,
      name: modifications.name || sourceProduct.name,
      category_id: sourceProduct.description_category_id || sourceProduct.category_id || 0,
      price: modifications.price || sourceProduct.price || "0",
      old_price: modifications.old_price || sourceProduct.old_price || "0",
      premium_price: modifications.premium_price || sourceProduct.premium_price || "0",
      vat: sourceProduct.vat || "0",
      attributes: (sourceProduct.attributes || []).map(a => ({ ...a })),
      images: (sourceProduct.images || []).map((i, idx) => ({ file_name: i, default: idx === 0 }))
    };

    // Apply modifications
    Object.assign(newProduct, modifications);

    return this.createProductsBatch([newProduct]);
  }

  async createProductsBatch(products) {
    return this.ozonRequest('/v2/product/import', { items: products });
  }
}

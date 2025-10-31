// src/services/api-client.js
import { BaseHttpClient } from './base-http-client';

export const apiClient = {
  async getProducts(limit = 20, profile, params = {}) {
    const query = new URLSearchParams();

    query.append('limit', params.limit || limit);
    if (params.last_id) query.append('last_id', params.last_id);
    if (params.offer_id) query.append('offer_id', params.offer_id);

    query.append('profile', encodeURIComponent(JSON.stringify(profile)));

    const response = await fetch(`/api/products?${query.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch products: ${text}`);
    }
    return response.json();
  },

  async getAttributes(offer_id, profile = null) {
    const query = new URLSearchParams({ offer_id });
    if (profile) query.append('profile', encodeURIComponent(JSON.stringify(profile)));

    console.log('🔍 getAttributes request:', `/api/products/attributes?${query.toString()}`);

    const res = await fetch(`/api/products/attributes?${query.toString()}`);
    console.log('🔍 getAttributes response status:', res.status);

    if (!res.ok) throw new Error('Failed to fetch attributes');
    return res.json();
  },

  async copyProduct(sourceOfferId, newOfferId, modifications, profile) {
    const res = await fetch('/api/copy-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceOfferId,
        newOfferId,
        modifications,
        profile
      })
    });
    if (!res.ok) throw new Error('Failed to copy product');
    return res.json();
  }
};

//export const apiClient = new ApiClient();

export class OzonProxyService {
  constructor(profile) {
    if (!profile || !profile.id) {
      throw new Error('Не выбран профиль OZON');
    }
    this.profileId = profile.id;
  }

  async createProductsBatch(items) {
    return this.post('/api/products/import', { items });
  }

  async getProductImportStatus(taskId) {
    return this.post('/api/products/import-status', { taskId });
  }

  async generateBarcodes(productIds) {
    return this.post('/api/products/barcodes', { productIds });
  }

  async post(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...body,
        profileId: this.profileId
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Request failed');
    }
    return response.json();
  }
}

class ApiClient {
  constructor() {
    this.baseURL = '/api';
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };
    console.log(`✅ request options: ${options}`);  
    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Request failed for ${url}:`, error);
      throw error;
    }
  }

  // Метод для продуктов с поддержкой профиля
  async getProducts(limit = 20, profile = null) {
    const params = new URLSearchParams({ limit: limit.toString() });
    
    if (profile) {
      params.append('profile', encodeURIComponent(JSON.stringify(profile)));
    }
    console.log(`✅ getProducts params: ${params}`);
    return this.request(`/products?${params}`);
  }

  // Метод для импорта товаров
  async importProducts(products, profile) {
    return this.request('/import-products', {
      method: 'POST',
      body: {
        products,
        profile
      }
    });
  }

  // Метод для массового импорта (батчами)
  async importProductsBatch(batches, profile, onProgress = null) {
    const results = [];
    
    for (let i = 0; i < batches.length; i++) {
      try {
        const result = await this.request('/import-products', {
          method: 'POST',
          body: {
            products: batches[i],
            profile
          }
        });
        
        results.push(result);
        
        if (onProgress) {
          onProgress(i + 1, batches.length);
        }
        
        // Задержка между батчами
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Batch ${i} failed:`, error);
        throw error;
      }
    }
    
    return results;
  }
}

export const apiClient = new ApiClient();
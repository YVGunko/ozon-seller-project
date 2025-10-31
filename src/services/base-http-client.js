// src/services/base-http-client.js
export class BaseHttpClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async request(endpoint, { method = 'POST', body, headers = {} } = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (body !== undefined) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`❌ Request failed: ${method} ${url}`, error);
      throw error;
    }
  }
}

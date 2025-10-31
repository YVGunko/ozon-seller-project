// src/services/base-http-client.js
export class BaseHttpClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async request(endpoint, { method = 'POST', body, headers = {}, signal } = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers }, signal };

    if (body !== undefined) {
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const res = await fetch(url, opts);
      const text = await res.text();

      if (!res.ok) {
        // Try to parse JSON error if present, otherwise return text
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        throw new Error(JSON.stringify({ status: res.status, body: parsed }));
      }

      return text ? JSON.parse(text) : null;
    } catch (err) {
      console.error(`BaseHttpClient request failed: ${method} ${url}`, err);
      throw err;
    }
  }
}

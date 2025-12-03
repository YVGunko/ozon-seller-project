import { put, list } from '@vercel/blob';

export class BlobKV {
  constructor(token, key) {
    if (!token) {
      throw new Error('BlobKV requires BLOB_READ_WRITE_TOKEN');
    }
    this.token = token;
    this.key = key?.replace(/^\/+/, '') || 'kv.json';
  }

  async readJSON(defaultValue = null) {
    try {
      const result = await list({ token: this.token, prefix: this.key, limit: 1 });
      const blob = result?.blobs?.find((item) => item.pathname === this.key);
      if (!blob) {
        return defaultValue;
      }
      const response = await fetch(blob.downloadUrl || blob.url);
      if (response.status === 404) {
        return defaultValue;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Blob read failed: ${response.status} ${text}`);
      }
      const text = await response.text();
      if (!text) {
        return defaultValue;
      }
      return JSON.parse(text);
    } catch (error) {
      console.error('BlobKV readJSON error:', error.message);
      return defaultValue;
    }
  }

  async writeJSON(value) {
    const payload = JSON.stringify(value ?? null);
    await put(this.key, payload, {
      access: 'public',
      token: this.token,
      contentType: 'application/json',
      addRandomSuffix: false
    });
  }
}

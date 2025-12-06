// src/modules/ai-prompts/blobJsonPromptsAdapter.js
//
// Реализация AiPromptsAdapter через Vercel Blob в виде JSON‑файлов.
//
// Структура хранения:
//   ai/prompts/
//     _global/              — глобальные промпты (userId = null)
//       <id>.json
//     <userId>/
//       <id>.json

import { put, list } from '@vercel/blob';
import { AiPromptsAdapter } from './promptsAdapter';

/**
 * @typedef {import('./types').AiPrompt} AiPrompt
 */

export class BlobJsonPromptsAdapter extends AiPromptsAdapter {
  constructor(prefix = 'ai/prompts') {
    super();
    this.prefix = prefix;
  }

  /**
   * Построить путь до файла промпта.
   * @param {AiPrompt} prompt
   */
  _buildPath(prompt) {
    const userSegment = prompt.userId || '_global';
    const id = prompt.id;
    return `${this.prefix}/${userSegment}/${id}.json`;
  }

  /**
   * Сохранить или обновить промпт.
   * Каждый промпт — отдельный JSON‑файл.
   *
   * @param {AiPrompt} prompt
   * @returns {Promise<AiPrompt>}
   */
  async savePrompt(prompt) {
    const pathname = this._buildPath(prompt);
    const json = JSON.stringify(prompt, null, 2);

    await put(pathname, json, {
      access: 'public',
      contentType: 'application/json'
    });

    return prompt;
  }

  /**
   * Получить промпт по id (поиск по всем пользователям).
   * @param {string} id
   * @returns {Promise<AiPrompt|null>}
   */
  async getPromptById(id) {
    const root = `${this.prefix}/`;
    const { blobs } = await list({ prefix: root });

    /** @type {AiPrompt|null} */
    let latest = null;

    for (const blob of blobs) {
      const downloadUrl = blob.downloadUrl || blob.url;
      const res = await fetch(downloadUrl);
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.id !== id) continue;

      if (!latest) {
        latest = /** @type {AiPrompt} */ (data);
        continue;
      }

      const latestTs = new Date(latest.updatedAt || latest.createdAt || 0).getTime();
      const currentTs = new Date(data.updatedAt || data.createdAt || 0).getTime();
      if (currentTs > latestTs) {
        latest = /** @type {AiPrompt} */ (data);
      }
    }

    return latest;
  }

  /**
   * Список промптов пользователя (или глобальных, если userId === null)
   * с опциональной фильтрацией по mode.
   *
   * @param {string|null} userId
   * @param {string} [mode]
   * @returns {Promise<AiPrompt[]>}
   */
  async listPromptsByUser(userId, mode) {
    const userSegment = userId || '_global';
    const prefix = `${this.prefix}/${userSegment}/`;

    const { blobs } = await list({ prefix });
    const results = await Promise.all(
      blobs.map(async (blob) => {
        try {
          const downloadUrl = blob.downloadUrl || blob.url;
          const res = await fetch(downloadUrl);
          const text = await res.text();
          const data = JSON.parse(text);
          if (mode && data.mode !== mode) return null;
          return /** @type {AiPrompt} */ (data);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[BlobJsonPromptsAdapter] failed to load prompt blob', {
            pathname: blob.pathname || blob.url || '',
            error: error?.message || String(error)
          });
          return null;
        }
      })
    );

    const filtered = results.filter(Boolean);

    // Дедупликация по id: оставляем самую "свежую" версию
    const byId = new Map();
    for (const prompt of filtered) {
      const key = prompt.id;
      if (!key) continue;
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, prompt);
        continue;
      }
      const existingTs = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const currentTs = new Date(prompt.updatedAt || prompt.createdAt || 0).getTime();
      if (currentTs > existingTs) {
        byId.set(key, prompt);
      }
    }

    const unique = Array.from(byId.values());

    // Сортируем по updatedAt DESC, затем по createdAt DESC
    return unique.sort((a, b) => {
      const aTime = a.updatedAt || a.createdAt || '';
      const bTime = b.updatedAt || b.createdAt || '';
      return aTime < bTime ? 1 : -1;
    });
  }

  /**
   * Удаление промпта.
   * В Vercel Blob нет delete API → пока возвращаем false.
   * Реальное удаление будет реализовано в DB‑адаптере.
   *
   * @param {string} _id
   * @returns {Promise<boolean>}
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async deletePromptById(_id) {
    return false;
  }
}

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

    for (const blob of blobs) {
      const downloadUrl = blob.downloadUrl || blob.url;
      const res = await fetch(downloadUrl);
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.id === id) return /** @type {AiPrompt} */ (data);
    }

    return null;
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
    const results = [];

    for (const blob of blobs) {
      const downloadUrl = blob.downloadUrl || blob.url;
      const res = await fetch(downloadUrl);
      const text = await res.text();
      const data = JSON.parse(text);
      if (mode && data.mode !== mode) continue;
      results.push(/** @type {AiPrompt} */ (data));
    }

    // Сортируем по updatedAt DESC, затем по createdAt DESC
    return results.sort((a, b) => {
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


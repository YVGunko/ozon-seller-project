// src/modules/ai-storage/blobJsonAdapter.js

import { put, list } from '@vercel/blob';
import { AiStorageAdapter } from './storageAdapter';
import { AiGenerationType } from './types'; // пока не используется, но пригодится для фильтров

/**
 * Реализация хранилища AI-генераций через Vercel Blob.
 * Каждая генерация — отдельный JSON-файл.
 *
 * Структура хранения:
 *   ai/
 *     users/
 *       <userId>/
 *         <timestamp>-<type>-<subType>.json
 *
 * Пример:
 *   ai/users/u123/2025-01-23T10:20:30.123Z-seo-seo-description.json
 */

export class BlobJsonAiStorageAdapter extends AiStorageAdapter {
  constructor(prefix = "ai/users") {
    super();
    this.prefix = prefix;
  }

  /**
   * Создаёт путь для сохранения JSON.
   *
   * Пример:
   *   ai/users/u123/2025-01-01T12:00:00.000Z-seo-seo-name.json
   */
  _buildPath(generation) {
    const ts = generation.createdAt || new Date().toISOString();
    const type = generation.type || "unknown";
    const subType = generation.subType || "generic";

    return `${this.prefix}/${generation.userId}/${ts}-${type}-${subType}.json`;
  }

  /**
   * Сохранить новую генерацию в Blob в виде JSON.
   */
  async saveGeneration(generation) {
    const pathname = this._buildPath(generation);
    const json = JSON.stringify(generation, null, 2);

    await put(pathname, json, {
      access: "private",
      contentType: "application/json",
    });
  }

  /**
   * Получить ВСЕ генерации пользователя (опционально отфильтрованные по type).
   */
  async listGenerationsByUser(userId, type) {
    const prefix = `${this.prefix}/${userId}/`;

    // Получаем список blob'ов по префиксу
    const { blobs } = await list({ prefix });

    // Фильтрация по type: например "-seo-" или "-rich-"
    const filtered = type
      ? blobs.filter((b) => b.pathname.includes(`-${type}-`))
      : blobs;

    const results = [];
    for (const blob of filtered) {
      const downloadUrl = blob.downloadUrl || blob.url;
      const res = await fetch(downloadUrl);
      const text = await res.text();
      results.push(JSON.parse(text));
    }

    // Сортировка по времени генерации (descending)
    return results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  /**
   * Получить конкретную генерацию по её id.
   * 
   * В JSON-хранилище файлы не индексируются по id,
   * поэтому мы просто ищем нужный файл вручную.
   *
   * В будущем, в адаптере DB — будет мгновенный SELECT по id.
   */
  async getGenerationById(id) {
    const root = `${this.prefix}/`;

    const { blobs } = await list({ prefix: root });

    for (const blob of blobs) {
      const downloadUrl = blob.downloadUrl || blob.url;
      const res = await fetch(downloadUrl);
      const text = await res.text();
      const data = JSON.parse(text);
      if (data.id === id) return data;
    }

    return null;
  }

  /**
   * Удаление генерации.
   * В Blob пока нет метода "delete", поэтому мы имитируем:
   *   - в JSON-хранилище просто игнорируем этот метод
   *   - реально delete появится в DB адаптере
   */
  async deleteGenerationById(id) {
    // В Vercel Blob нет delete API → возвращаем false на данном этапе
    return false;
  }
}

// src/modules/ai-storage/aiStorageService.js
//
// Сервисный слой поверх абстрактного AiStorageAdapter.
// Здесь инкапсулируем:
//   - сбор объекта AiGeneration из разрозненных данных;
//   - генерацию id / createdAt;
//   - простые методы выборки для UI / API.

import { AiStorageAdapter } from './storageAdapter';
import { AiGenerationType, AiGenerationSubType } from './types';

/**
 * @typedef {import('./types').AiGeneration} AiGeneration
 */

function createGenerationId() {
  // Предпочитаем криптографически стойкий UUID, если доступен
  const globalCrypto =
    (typeof globalThis !== 'undefined' && globalThis.crypto) ||
    (typeof crypto !== 'undefined' ? crypto : null);

  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }

  // Фолбэк для сред без randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class AiStorageService {
  /**
   * @param {AiStorageAdapter} adapter
   */
  constructor(adapter) {
    if (!adapter || !(adapter instanceof AiStorageAdapter)) {
      throw new Error('AiStorageService: adapter must be instance of AiStorageAdapter');
    }
    this.adapter = adapter;
  }

  /**
   * Создать и сохранить генерацию.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.type         // из AiGenerationType
   * @param {string} params.subType      // из AiGenerationSubType
   * @param {string} [params.mode]       // логический режим (seo-name, description, hashtags, rich, slides, custom…)
   * @param {string|null} [params.promptId] // id сохранённого промпта (если есть)
   * @param {string} params.model
   * @param {Object} params.input
   * @param {string} params.prompt
   * @param {Object|string} params.output
   * @param {string[]} [params.images]
   * @param {Object|string|null} [params.rawOutput]
   * @returns {Promise<AiGeneration>}
   */
  async createGeneration(params) {
    const {
      userId,
      type = AiGenerationType.CUSTOM,
      subType = AiGenerationSubType.CUSTOM_GENERIC,
      mode,
      promptId = null,
      model,
      input,
      prompt,
      output,
      images = [],
      rawOutput = null
    } = params || {};

    if (!userId) {
      throw new Error('AiStorageService.createGeneration: userId is required');
    }
    if (!model) {
      throw new Error('AiStorageService.createGeneration: model is required');
    }

    const allowedTypes = Object.values(AiGenerationType);
    const allowedSubTypes = Object.values(AiGenerationSubType);

    if (!allowedTypes.includes(type)) {
      throw new Error(`AiStorageService.createGeneration: unknown type "${type}"`);
    }
    if (!allowedSubTypes.includes(subType)) {
      throw new Error(`AiStorageService.createGeneration: unknown subType "${subType}"`);
    }

    const now = new Date().toISOString();

    /** @type {AiGeneration} */
    const generation = {
      id: createGenerationId(),
      userId,
      type,
      subType,
      mode,
      promptId,
      model,
      input: input || {},
      prompt: prompt || '',
      output: output ?? null,
      images: Array.isArray(images) ? images : [],
      rawOutput,
      createdAt: now
    };

    try {
      await this.adapter.saveGeneration(generation);
      return generation;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiStorageService] saveGeneration failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        generationId: generation.id,
        userId: generation.userId,
        type: generation.type,
        subType: generation.subType,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Список генераций пользователя (опционально по крупной категории).
   *
   * @param {string} userId
   * @param {string} [type]  // AiGenerationType.*
   * @returns {Promise<AiGeneration[]>}
   */
  async listUserGenerations(userId, type) {
    if (!userId) {
      throw new Error('AiStorageService.listUserGenerations: userId is required');
    }
    try {
      return await this.adapter.listGenerationsByUser(userId, type);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiStorageService] listUserGenerations failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        userId,
        type,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Получить одну генерацию по id.
   *
   * @param {string} id
   * @returns {Promise<AiGeneration|null>}
   */
  async getGeneration(id) {
    if (!id) {
      throw new Error('AiStorageService.getGeneration: id is required');
    }
    try {
      return await this.adapter.getGenerationById(id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiStorageService] getGeneration failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        id,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Удалить генерацию.
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteGeneration(id) {
    if (!id) {
      throw new Error('AiStorageService.deleteGeneration: id is required');
    }
    try {
      return await this.adapter.deleteGenerationById(id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiStorageService] deleteGeneration failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        id,
        error: error?.message || String(error)
      });
      throw error;
    }
  }
}

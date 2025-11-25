// src/modules/ai-prompts/aiPromptsService.js
//
// Сервисный слой над абстрактным AiPromptsAdapter.
// Отвечает за:
//   - создание/обновление промптов;
//   - выбор активного промпта для (userId, mode);
//   - управление флагом isDefault.

import { AiPromptsAdapter } from './promptsAdapter';

/**
 * @typedef {import('./types').AiPrompt} AiPrompt
 */

function createPromptId() {
  const globalCrypto =
    (typeof globalThis !== 'undefined' && globalThis.crypto) ||
    (typeof crypto !== 'undefined' ? crypto : null);

  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class AiPromptsService {
  /**
   * @param {AiPromptsAdapter} adapter
   */
  constructor(adapter) {
    if (!adapter || !(adapter instanceof AiPromptsAdapter)) {
      throw new Error('AiPromptsService: adapter must be instance of AiPromptsAdapter');
    }
    this.adapter = adapter;
  }

  /**
   * Создать новый промпт.
   *
   * @param {Object} params
   * @param {string|null} params.userId
   * @param {string} params.mode
   * @param {string} params.title
   * @param {string} [params.description]
   * @param {string} params.systemTemplate
   * @param {string} params.userTemplate
   * @param {Object|null} [params.variablesSchema]
   * @param {boolean} [params.isDefault]
   * @returns {Promise<AiPrompt>}
   */
  async createPrompt(params) {
    const {
      userId = null,
      mode,
      title,
      description,
      systemTemplate,
      userTemplate,
      variablesSchema = null,
      isDefault = false
    } = params || {};

    if (!mode) {
      throw new Error('AiPromptsService.createPrompt: mode is required');
    }
    if (!title) {
      throw new Error('AiPromptsService.createPrompt: title is required');
    }
    if (!systemTemplate) {
      throw new Error('AiPromptsService.createPrompt: systemTemplate is required');
    }
    if (!userTemplate) {
      throw new Error('AiPromptsService.createPrompt: userTemplate is required');
    }

    const now = new Date().toISOString();

    /** @type {AiPrompt} */
    const prompt = {
      id: createPromptId(),
      userId,
      mode,
      title,
      description: description || '',
      systemTemplate,
      userTemplate,
      variablesSchema,
      isDefault: Boolean(isDefault),
      createdAt: now,
      updatedAt: now
    };

    try {
      const saved = await this.adapter.savePrompt(prompt);

      if (saved.isDefault) {
        await this.setDefaultPrompt({
          userId: saved.userId,
          mode: saved.mode,
          promptId: saved.id
        });
      }

      return saved;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiPromptsService] createPrompt failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        mode,
        userId,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Обновить существующий промпт.
   *
   * @param {string} id
   * @param {Partial<AiPrompt>} patch
   * @returns {Promise<AiPrompt>}
   */
  async updatePrompt(id, patch) {
    if (!id) {
      throw new Error('AiPromptsService.updatePrompt: id is required');
    }
    try {
      const existing = await this.adapter.getPromptById(id);
      if (!existing) {
        throw new Error(`AiPromptsService.updatePrompt: prompt ${id} not found`);
      }

      const now = new Date().toISOString();
      const merged = {
        ...existing,
        ...patch,
        id: existing.id,
        userId: patch.userId !== undefined ? patch.userId : existing.userId,
        mode: patch.mode || existing.mode,
        updatedAt: now
      };

      const saved = await this.adapter.savePrompt(merged);

      if (patch.isDefault === true) {
        await this.setDefaultPrompt({
          userId: saved.userId,
          mode: saved.mode,
          promptId: saved.id
        });
      }

      return saved;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiPromptsService] updatePrompt failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        id,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Установить промпт дефолтным для (userId, mode).
   * Все остальные промпты для этой пары перестают быть дефолтными.
   *
   * @param {Object} params
   * @param {string|null} params.userId
   * @param {string} params.mode
   * @param {string} params.promptId
   */
  async setDefaultPrompt(params) {
    const { userId = null, mode, promptId } = params || {};
    if (!mode || !promptId) {
      throw new Error('AiPromptsService.setDefaultPrompt: mode and promptId are required');
    }
    try {
      const prompts = await this.adapter.listPromptsByUser(userId, mode);
      const now = new Date().toISOString();

      for (const prompt of prompts) {
        const shouldBeDefault = prompt.id === promptId;
        if (Boolean(prompt.isDefault) === shouldBeDefault) continue;

        const updated = {
          ...prompt,
          isDefault: shouldBeDefault,
          updatedAt: now
        };
        await this.adapter.savePrompt(updated);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiPromptsService] setDefaultPrompt failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        userId,
        mode,
        promptId,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Получить активный промпт для пользователя и режима.
   * Сначала ищем дефолтный промпт пользователя,
   * затем глобальный (userId = null).
   *
   * @param {Object} params
   * @param {string|null} params.userId
   * @param {string} params.mode
   * @returns {Promise<AiPrompt>}
   */
  async getActivePrompt(params) {
    const { userId = null, mode } = params || {};
    if (!mode) {
      throw new Error('AiPromptsService.getActivePrompt: mode is required');
    }

    try {
      // 1. Пользовательский дефолт
      const userPrompts = await this.adapter.listPromptsByUser(userId, mode);
      const userDefault = userPrompts.find((p) => p.isDefault);
      if (userDefault) return userDefault;

      // 2. Глобальный дефолт
      const globalPrompts = await this.adapter.listPromptsByUser(null, mode);
      const globalDefault = globalPrompts.find((p) => p.isDefault);
      if (globalDefault) return globalDefault;

      throw new Error(
        `Нет активного промпта для mode="${mode}" (userId=${userId || 'null'})`
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiPromptsService] getActivePrompt failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        userId,
        mode,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Список промптов пользователя (или глобальных, если userId === null)
   *
   * @param {string|null} userId
   * @param {string} [mode]
   * @returns {Promise<AiPrompt[]>}
   */
  async listPromptsByUser(userId, mode) {
    try {
      return await this.adapter.listPromptsByUser(userId, mode);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiPromptsService] listPromptsByUser failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        userId,
        mode,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  /**
   * Удалить промпт по id.
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deletePrompt(id) {
    if (!id) {
      throw new Error('AiPromptsService.deletePrompt: id is required');
    }
    try {
      return await this.adapter.deletePromptById(id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AiPromptsService] deletePrompt failed', {
        adapter: this.adapter?.constructor?.name || 'unknown',
        id,
        error: error?.message || String(error)
      });
      throw error;
    }
  }
}


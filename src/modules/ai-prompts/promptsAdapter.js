// src/modules/ai-prompts/promptsAdapter.js
//
// Абстрактный адаптер хранилища для AI‑промптов.
// Конкретные реализации (Blob, DB и т.п.) должны наследоваться от этого класса.

/**
 * @typedef {import('./types').AiPrompt} AiPrompt
 */

export class AiPromptsAdapter {
  /**
   * Сохранить или обновить промпт.
   * @param {AiPrompt} _prompt
   * @returns {Promise<AiPrompt>}
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async savePrompt(_prompt) {
    throw new Error('AiPromptsAdapter.savePrompt must be implemented');
  }

  /**
   * Получить промпт по id.
   * @param {string} _id
   * @returns {Promise<AiPrompt|null>}
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async getPromptById(_id) {
    throw new Error('AiPromptsAdapter.getPromptById must be implemented');
  }

  /**
   * Список промптов пользователя (userId) с опциональной фильтрацией по mode.
   * userId === null означает глобальные промпты.
   *
   * @param {string|null} _userId
   * @param {string} [_mode]
   * @returns {Promise<AiPrompt[]>}
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async listPromptsByUser(_userId, _mode) {
    throw new Error('AiPromptsAdapter.listPromptsByUser must be implemented');
  }

  /**
   * Удалить промпт по id.
   * @param {string} _id
   * @returns {Promise<boolean>}
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async deletePromptById(_id) {
    throw new Error('AiPromptsAdapter.deletePromptById must be implemented');
  }
}


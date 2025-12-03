// src/modules/ai-storage/storageAdapter.js

/**
 * @typedef {import("./types").AiGeneration} AiGeneration
 */

/**
 * Базовый интерфейс хранилища генераций.
 * 
 * ВНИМАНИЕ:
 *  - Этот адаптер не должен зависеть от Next.js, API-роутов или Ozon.
 *  - Это "контракт", который будут реализовывать разные backend-провайдеры:
 *      - BlobJsonAiStorageAdapter  (Vercel Blob + JSON)
 *      - DbAiStorageAdapter        (Postgres/Turso)
 *      - CmsAiStorageAdapter       (Sanity/Hygraph)
 *  - Сам по себе этот файл НЕ содержит логики — только сигнатуры.
 */
export class AiStorageAdapter {
  /**
   * Сохранить новую генерацию.
   *
   * @param {AiGeneration} generation
   * @returns {Promise<void>}
   */
  async saveGeneration(generation) {
    throw new Error("AiStorageAdapter.saveGeneration() not implemented");
  }

  /**
   * Получить генерации пользователя.
   * Если указан type — фильтровать по крупной категории (seo/image/rich/...).
   * Если нужен более детальный фильтр — его выполняет сервисный слой (не адаптер).
   *
   * @param {string} userId
   * @param {string} [type]  // одна из AiGenerationType или undefined
   * @returns {Promise<AiGeneration[]>}
   */
  async listGenerationsByUser(userId, type) {
    throw new Error("AiStorageAdapter.listGenerationsByUser() not implemented");
  }

  /**
   * Найти одну генерацию по id.
   *
   * @param {string} id
   * @returns {Promise<AiGeneration|null>}
   */
  async getGenerationById(id) {
    throw new Error("AiStorageAdapter.getGenerationById() not implemented");
  }

  /**
   * Удалить одну генерацию.
   *
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async deleteGenerationById(id) {
    throw new Error("AiStorageAdapter.deleteGenerationById() not implemented");
  }
}

// src/domain/services/marketplaceAdapter.js
//
// Базовый интерфейс адаптера маркетплейса.
// Конкретные реализации (Ozon, WB, Yandex Market и т.д.)
// должны реализовывать этот контракт.
//
// На этом шаге нам нужен только метод для получения
// характеристик категории/типа (description attributes).

/**
 * @typedef {Object} DescriptionAttributesRequest
 * @property {string|number} descriptionCategoryId
 * @property {string|number} typeId
 * @property {Array<Object>} [attributes]   Список уже имеющихся атрибутов (для обогащения)
 * @property {string} [language]            Код языка, по умолчанию 'DEFAULT'
 */

/**
 * @typedef {Object} DescriptionAttributesResponse
 * @property {Array<Object>} attributes     Полный список meta‑атрибутов для комбинации
 */

export class MarketplaceAdapter {
  /**
   * Получить meta‑характеристики для пары (descriptionCategoryId, typeId).
   * Должен быть реализован в конкретном адаптере.
   *
   * @param {DescriptionAttributesRequest} _params
   * @returns {Promise<DescriptionAttributesResponse>}
   */
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async fetchDescriptionAttributesForCombo(_params) {
    throw new Error('fetchDescriptionAttributesForCombo не реализован для этого адаптера');
  }
}


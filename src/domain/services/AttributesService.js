// src/domain/services/AttributesService.js
//
// Доменный сервис для работы с атрибутами товаров.
// На первом шаге инкапсулирует запрос meta‑характеристик
// для пары (description_category_id, type_id) через MarketplaceAdapter.

import { MarketplaceAdapter } from './marketplaceAdapter';

export class AttributesService {
  /**
   * Получить meta‑атрибуты для комбинации (descriptionCategoryId, typeId)
   * через конкретный адаптер маркетплейса.
   *
   * @param {MarketplaceAdapter} adapter
   * @param {import('./marketplaceAdapter').DescriptionAttributesRequest} params
   * @returns {Promise<import('./marketplaceAdapter').DescriptionAttributesResponse>}
   */
  static async fetchDescriptionAttributesForCombo(adapter, params) {
    if (!adapter || !(adapter instanceof MarketplaceAdapter)) {
      throw new Error('AttributesService: adapter must be instance of MarketplaceAdapter');
    }
    if (!params || !params.descriptionCategoryId || !params.typeId) {
      throw new Error(
        'AttributesService: descriptionCategoryId и typeId обязательны для fetchDescriptionAttributesForCombo'
      );
    }
    return adapter.fetchDescriptionAttributesForCombo(params);
  }
}


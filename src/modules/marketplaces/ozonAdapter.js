// src/modules/marketplaces/ozonAdapter.js
//
// Реализация MarketplaceAdapter для OZON.

import { MarketplaceAdapter } from '../../domain/services/marketplaceAdapter';
import { OzonApiService } from '../../services/ozon-api';
import { fetchDescriptionAttributesForCombo } from '../../server/descriptionAttributesHelper';

export class OzonMarketplaceAdapter extends MarketplaceAdapter {
  /**
   * @param {Object} profile
   * @param {string} profile.ozon_api_key
   * @param {string} profile.ozon_client_id
   */
  constructor(profile) {
    super();
    this.marketplace = 'ozon';
    this.profile = profile;
    this.client = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
  }

  /**
   * @param {import('../../domain/services/marketplaceAdapter').DescriptionAttributesRequest} params
   * @returns {Promise<import('../../domain/services/marketplaceAdapter').DescriptionAttributesResponse>}
   */
  async fetchDescriptionAttributesForCombo(params) {
    const {
      descriptionCategoryId,
      typeId,
      attributes = [],
      language = 'DEFAULT'
    } = params || {};

    const { attributes: metaAttributes } = await fetchDescriptionAttributesForCombo({
      ozon: this.client,
      descriptionCategoryId,
      typeId,
      attributes,
      language
    });

    return { attributes: metaAttributes || [] };
  }
}


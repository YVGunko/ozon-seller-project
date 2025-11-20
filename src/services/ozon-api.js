// src/services/ozon-api.js
import {
  REQUIRED_BASE_FIELDS,
  NUMERIC_BASE_FIELDS
} from '../constants/productFields';

const DESCRIPTION_ATTRIBUTE_CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const ATTRIBUTE_DICTIONARY_CACHE_TTL = 1000 * 60 * 60; // 60 minutes
const descriptionCategoryAttributeCache = new Map();
const attributeDictionaryCache = new Map();
const attributeDictionarySearchCache = new Map();
const HASHTAG_ATTRIBUTE_ID = 23171;
const HASHTAG_ATTRIBUTE_LABEL = '#Хештеги';
const HASHTAG_ATTRIBUTE_MAX_TAGS = 30;
const HASHTAG_VALUE_REGEX = /^#[a-zA-Zа-яА-Я0-9_]{2,30}$/;

const buildDescriptionAttributeCacheKey = (descriptionCategoryId, typeId, language) => {
  return `${language || 'DEFAULT'}:${descriptionCategoryId || 'none'}:${typeId || 'none'}`;
};

const buildAttributeDictionaryCacheKey = (attributeId, descriptionCategoryId, typeId, language, lastValueId, limit) => {
  return [
    attributeId || 'none',
    descriptionCategoryId || 'none',
    typeId || 'none',
    language || 'DEFAULT',
    lastValueId ?? 0,
    limit ?? 100
  ].join(':');
};

const buildAttributeDictionarySearchKey = (
  attributeId,
  descriptionCategoryId,
  typeId,
  language,
  value,
  limit
) => {
  return [
    attributeId || 'none',
    descriptionCategoryId || 'none',
    typeId || 'none',
    language || 'DEFAULT',
    value || '',
    limit ?? 100
  ].join(':');
};

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const normalizeHashtagAttributeValues = (values = []) => {
  const collectedTags = [];

  values.forEach((entry) => {
    const raw =
      entry?.value ??
      entry?.text ??
      entry?.value_text ??
      '';
    if (raw === undefined || raw === null) {
      return;
    }

    const normalized = String(raw)
      .replace(/[\r\n]+/g, ' ')
      .trim();
    if (!normalized) {
      return;
    }

    const tags = normalized.split(/\s+/).filter(Boolean);
    tags.forEach((tag) => {
      if (!HASHTAG_VALUE_REGEX.test(tag)) {
        throw new Error(
          `Тег "${tag}" в атрибуте "${HASHTAG_ATTRIBUTE_LABEL}" имеет неверный формат. Используйте символ #, буквы, цифры или _.`
        );
      }
      collectedTags.push(tag);
    });
  });

  if (collectedTags.length > HASHTAG_ATTRIBUTE_MAX_TAGS) {
    throw new Error(
      `Атрибут "${HASHTAG_ATTRIBUTE_LABEL}" может содержать максимум ${HASHTAG_ATTRIBUTE_MAX_TAGS} тегов. Сейчас указано ${collectedTags.length}.`
    );
  }

  if (!collectedTags.length) {
    return [];
  }

  return [
    {
      value: collectedTags.join(' ')
    }
  ];
};

export class OzonApiService {
  constructor(apiKey, clientId) {
    this.baseUrl = 'https://api-seller.ozon.ru';
    this.headers = {
      'Client-Id': clientId,
      'Api-Key': apiKey,
      'Content-Type': 'application/json'
    };
  }

  async request(endpoint, body) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      data = null;
    }
    if (!response.ok) {
      const error = new Error(data?.message || `OZON API error: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async requestGet(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, item));
      } else {
        url.searchParams.append(key, value);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers
    });

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      data = null;
    }

    if (!response.ok) {
      const error = new Error(data?.message || `OZON API error: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async getProducts({ limit = 20, last_id = '', filter = {} } = {}) {
    const body = { limit, last_id, filter };
    return this.request('/v3/product/list', body);
  }

  async getAttributes(offer_id) {
    return this.request('/v3/products/info/attributes', { offer_id: [offer_id] });
  }

  async getProductAttributes(offerId) {
    const ids = Array.isArray(offerId) ? offerId : [offerId];
    return this.request('/v4/product/info/attributes', {
      filter: { offer_id: ids },
      limit: 1
    });
  }

  async getDescriptionCategoryAttributes(descriptionCategoryId, typeId, language = 'DEFAULT') {
    if (!descriptionCategoryId || !typeId) {
      throw new Error('descriptionCategoryId и typeId обязательны для запроса характеристик категории');
    }

    const cacheKey = buildDescriptionAttributeCacheKey(descriptionCategoryId, typeId, language);
    const cached = descriptionCategoryAttributeCache.get(cacheKey);

    if (cached) {
      if (cached.expiresAt > Date.now()) {
        return cached.data;
      }
      descriptionCategoryAttributeCache.delete(cacheKey);
    }

    console.log('[OzonApiService] fetch description-category attributes', {
      descriptionCategoryId,
      typeId,
      language
    });
    const data = await this.request('/v1/description-category/attribute', {
      description_category_id: descriptionCategoryId,
      language,
      type_id: typeId
    });

    descriptionCategoryAttributeCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + DESCRIPTION_ATTRIBUTE_CACHE_TTL
    });

    return data;
  }

  async getWarehouses() {
    return this.request('/v1/warehouse/list', {});
  }

  async copyProduct(sourceOfferId, newOfferId, modifications = {}) {
    const body = {
      source_offer_id: sourceOfferId,
      new_offer_id: newOfferId,
      modifications
    };
    return this.request('/v3/product/import', body);
  }

  normalizeAttributeUpdateItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Не переданы товары для обновления');
    }

    const normalizedItems = items
      .map((item) => {
        const offerId = item.offer_id || item.offerId;
        const prepared = {
          ...item,
          offer_id: offerId ? String(offerId) : undefined
        };

        const typeId = Number(item.type_id ?? item.typeId);
        if (Number.isFinite(typeId) && typeId > 0) {
          prepared.type_id = typeId;
        } else {
          delete prepared.type_id;
          delete prepared.typeId;
        }

        if (Array.isArray(item.attributes)) {
          prepared.attributes = item.attributes
            .map((attr) => {
              const id = Number(attr?.id ?? attr?.attribute_id);
              if (!id) return null;

              const values = (attr.values || [])
                .map((valueEntry) => {
                  const raw =
                    valueEntry?.value ??
                    valueEntry?.text ??
                    valueEntry?.value_text ??
                    valueEntry;
                  if (raw === undefined || raw === null) return null;
                  const str = String(raw).trim();
                  if (!str) return null;
                  return { value: str };
                })
                .filter(Boolean);

              if (!values.length) return null;

              if (id === HASHTAG_ATTRIBUTE_ID) {
                const normalizedHashtags = normalizeHashtagAttributeValues(values);
                if (!normalizedHashtags.length) return null;
                return {
                  id,
                  values: normalizedHashtags
                };
              }

              return {
                id,
                values
              };
            })
            .filter(Boolean);
          if (!prepared.attributes.length) {
            delete prepared.attributes;
          }
        }

        REQUIRED_BASE_FIELDS.forEach((field) => {
          if (hasValue(item[field])) {
            prepared[field] = String(item[field]);
          }
        });

        const missingBaseFields = REQUIRED_BASE_FIELDS.filter((field) => {
          const value = prepared[field];
          if (!hasValue(value)) return true;
          if (NUMERIC_BASE_FIELDS.includes(field)) {
            const numeric = Number(value);
            return !Number.isFinite(numeric) || numeric <= 0;
          }
          return false;
        });

        if (missingBaseFields.length) {
          throw new Error(
            `Товар ${prepared.offer_id || 'без offer_id'}: заполните поля ${missingBaseFields.join(', ')}`
          );
        }

        return prepared;
      })
      .filter((item) => {
        const hasAttributes = Array.isArray(item.attributes) && item.attributes.length > 0;
        const hasBaseFields = REQUIRED_BASE_FIELDS.every((field) => hasValue(item[field]));
        return item.offer_id && (hasAttributes || hasBaseFields);
      });

    if (!normalizedItems.length) {
      throw new Error('Нет атрибутов для обновления');
    }

    return normalizedItems;
  }

  async getAttributeDictionaryValues({
    attribute_id,
    description_category_id,
    type_id,
    language = 'DEFAULT',
    last_value_id = 0,
    limit = 100
  }) {
    if (!attribute_id || !description_category_id || !type_id) {
      throw new Error('attribute_id, description_category_id и type_id обязательны для запроса справочника атрибутов');
    }

    const cacheKey = buildAttributeDictionaryCacheKey(
      attribute_id,
      description_category_id,
      type_id,
      language,
      last_value_id,
      limit
    );

    const cached = attributeDictionaryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const data = await this.request('/v1/description-category/attribute/values', {
      attribute_id,
      description_category_id,
      language,
      last_value_id,
      limit,
      type_id
    });

    attributeDictionaryCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + ATTRIBUTE_DICTIONARY_CACHE_TTL
    });

    return data;
  }

  async searchAttributeDictionaryValues({
    attribute_id,
    description_category_id,
    type_id,
    language = 'DEFAULT',
    value = '',
    limit = 100
  }) {
    if (!attribute_id || !description_category_id || !type_id || !value) {
      throw new Error('attribute_id, description_category_id, type_id и value обязательны для поиска в справочнике атрибутов');
    }

    const cacheKey = buildAttributeDictionarySearchKey(
      attribute_id,
      description_category_id,
      type_id,
      language,
      value,
      limit
    );

    const cached = attributeDictionarySearchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const data = await this.request('/v1/description-category/attribute/values/search', {
      attribute_id,
      description_category_id,
      language,
      limit,
      type_id,
      value
    });

    attributeDictionarySearchCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + ATTRIBUTE_DICTIONARY_CACHE_TTL
    });

    return data;
  }


  // Метод для парсинга Excel файла
  async parseExcelFile(file) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file); // 'file' should be a Buffer

    const worksheet = workbook.worksheets[0]; // Get first sheet
    const jsonData = [];

    // Process rows. Note: ExcelJS rows are 1-indexed.
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row if your file has one

      // Access cell values by column number (1-indexed)
      const processedRow = {
        index: rowNumber - 1, // Adjust for zero-based index
        colourCode: row.getCell(2).value?.toString(), // Assuming Colour Code is col A
        colourName: row.getCell(3).value?.toString(), // Assuming Colour Name is col B
        carBrand: row.getCell(5).value?.toString(),   // Assuming Car Brand is col C
        rawData: row.values // Gets all values as an array
      };

      // Only push rows that have data
      if (processedRow.colourCode) {
        jsonData.push(processedRow);
      }
    });

    return jsonData;
  }

  findColumnValue(row, possibleColumnNames) {
    for (const colName of possibleColumnNames) {
      if (row[colName] !== undefined) {
        return row[colName];
      }
    }
    return '';
  }

  // Вспомогательный метод для формирования данных товара
  prepareProductFromTemplate(baseData, excelRow, fieldMappings) {
    const product = {
      offer_id: this.generateFieldValue('offer_id', baseData, excelRow, fieldMappings),
      name: this.generateFieldValue('name', baseData, excelRow, fieldMappings),
      category_id: baseData.category_id,
      price: baseData.price || "0",
      old_price: baseData.old_price || "0",
      vat: baseData.vat || "0",
      attributes: []
    };

    // Добавляем атрибуты на основе fieldMappings
    Object.keys(fieldMappings).forEach(fieldKey => {
      const mapping = fieldMappings[fieldKey];
      if (mapping.attributeId && mapping.enabled) {
        const value = this.generateFieldValue(fieldKey, baseData, excelRow, fieldMappings);
        if (value) {
          product.attributes.push({
            id: mapping.attributeId,
            value: value
          });
        }
      }
    });

    return product;
  }

  // В классе OzonApiService, добавим отладку
  generateFieldValue(fieldKey, baseData, row, fieldMappings) {
    const config = fieldMappings[fieldKey];
    if (!config || !config.enabled) return '';

    let value = config.template;

    console.log(`Processing field: ${fieldKey}, template: ${value}`);
    console.log('Available row fields:', Object.keys(row));
    console.log('Available baseData fields:', Object.keys(baseData));

    // Заменяем плейсхолдеры на реальные значения
    value = value.replace(/{(\w+)}/g, (match, placeholder) => {
      let replacement = '';

      // Сначала проверяем данные из строки Excel
      if (placeholder in row) {
        replacement = row[placeholder] || '';
      }
      // Затем базовые данные товара
      else if (placeholder in baseData) {
        replacement = baseData[placeholder] || '';
      }

      console.log(`Replacing {${placeholder}} with: "${replacement}"`);
      return replacement;
    });

    console.log(`Final value for ${fieldKey}: ${value}`);
    return value;
  }
  // Метод для массового создания товаров
  async createProductsBatch(items) {
    if (!Array.isArray(items)) {
      throw new Error('Для импорта требуется массив товаров');
    }

    const body = {
      items
    };

    console.log('🆕 Creating products batch:', JSON.stringify(body, null, 2));
    return this.request('/v3/product/import', body);
  }

  async updateProductAttributes(items) {
    const normalizedItems = this.normalizeAttributeUpdateItems(items);
    return this.request('/v1/product/attributes/update', {
      items: normalizedItems
    });
  }

  async importProductAttributes(items) {
    const normalizedItems = this.normalizeAttributeUpdateItems(items);
    return this.createProductsBatch(normalizedItems);
  }

  async getActions(params = {}) {
    return this.requestGet('/v1/actions', params);
  }

  async getActionCandidates({ action_id, limit = 100, last_id = null } = {}) {
    if (!action_id && action_id !== 0) {
      throw new Error('action_id обязателен для запроса кандидатов');
    }
    const payload = {
      action_id,
      limit: Number(limit) || 100
    };
    if (last_id !== undefined && last_id !== null && last_id !== '') {
      payload.last_id = last_id;
    }
    return this.request('/v1/actions/candidates', payload);
  }

  async getProductImportStatus(taskId) {
    if (!taskId) {
      throw new Error('Не передан task_id');
    }

    const response = await this.request('/v1/product/import/info', {
      task_id: String(taskId)
    });

    if (!response?.result) {
      return { result: response };
    }

    return response;
  }

  async getProductInfoList(offerIds = []) {
    const ids = Array.isArray(offerIds)
      ? offerIds.filter(Boolean).map((id) => String(id))
      : [];

    if (!ids.length) {
      throw new Error('Не переданы offer_id для проверки статуса товара');
    }

    return this.request('/v3/product/info/list', {
      offer_id: ids
    });
  }

  async getProductInfoPrices({
    offer_ids = [],
    product_ids = [],
    limit = 100,
    cursor = ''
  } = {}) {
    const payload = {
      filter: {},
      limit: Math.min(Math.max(Number(limit) || 100, 1), 1000)
    };

    if (Array.isArray(offer_ids) && offer_ids.length) {
      payload.filter.offer_id = offer_ids.filter(Boolean).map(String);
    }
    if (Array.isArray(product_ids) && product_ids.length) {
      payload.filter.product_id = product_ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
    }
    if (cursor) {
      payload.cursor = String(cursor);
    }

    return this.request('/v5/product/info/prices', payload);
  }

  async getProductInfoAttributes({ limit = 50, last_id = '', offer_ids = [], sku = [] } = {}) {
    const payload = {
      limit: Number(limit) || 50,
      last_id: String(last_id || ''),
      filter: {}
    };

    if (Array.isArray(offer_ids) && offer_ids.length) {
      payload.filter.offer_id = offer_ids.filter(Boolean).map(String);
    }

    if (Array.isArray(sku) && sku.length) {
      payload.filter.sku = sku.filter(Boolean).map(String);
    }

    if (!payload.filter.offer_id && !payload.filter.sku) {
      payload.filter.visibility = 'ALL';
    }

    return this.request('/v4/product/info/attributes', payload);
  }

  async getFbsUnfulfilledPostings({
    dir = 'asc',
    limit = 50,
    last_id = '',
    filter = {},
    withOptions = {}
  } = {}) {
    const payload = {
      dir: dir === 'desc' ? 'desc' : 'asc',
      limit: Math.min(Math.max(Number(limit) || 50, 1), 1000),
      last_id: last_id ? String(last_id) : '',
      filter,
      with: {
        analytics_data: Boolean(withOptions.analytics_data),
        barcodes: Boolean(withOptions.barcodes),
        financial_data: Boolean(withOptions.financial_data),
        legal_info: Boolean(withOptions.legal_info),
        translit: Boolean(withOptions.translit)
      }
    };

    return this.request('/v3/posting/fbs/unfulfilled/list', payload);
  }

  async generateBarcodes(productIds = []) {
    const ids = Array.isArray(productIds)
      ? productIds
          .filter((id) => id !== undefined && id !== null && id !== '')
          .map((id) => String(id))
      : [];

    if (!ids.length) {
      throw new Error('Не переданы product_ids для генерации штрихкодов');
    }

    return this.request('/v1/barcode/generate', {
      product_ids: ids
    });
  }

  async updateProductStocks(stocks = []) {
    if (!Array.isArray(stocks) || !stocks.length) {
      throw new Error('Не переданы остатки для обновления');
    }

    const normalizedStocks = stocks
      .map((entry) => {
        const offerId = entry?.offer_id ?? entry?.offerId ?? '';
        const productNumeric = Number(entry?.product_id ?? entry?.productId);
        const stockNumeric = Number(entry?.stock);
        const warehouseNumeric = Number(entry?.warehouse_id ?? entry?.warehouseId);

        if (!Number.isFinite(stockNumeric) || stockNumeric < 0) {
          return null;
        }
        if (!Number.isFinite(warehouseNumeric) || warehouseNumeric <= 0) {
          return null;
        }

        const payload = {
          stock: stockNumeric,
          warehouse_id: warehouseNumeric
        };

        if (offerId) {
          payload.offer_id = String(offerId);
        }
        if (Number.isFinite(productNumeric) && productNumeric > 0) {
          payload.product_id = productNumeric;
        }

        if (!payload.offer_id && payload.product_id === undefined) {
          return null;
        }

        return payload;
      })
      .filter(Boolean);

    if (!normalizedStocks.length) {
      throw new Error('Нет валидных записей для обновления остатков');
    }

    return this.request('/v2/products/stocks', {
      stocks: normalizedStocks
    });
  }

  async updateOfferIds(update_offer_id = []) {
    if (!Array.isArray(update_offer_id) || !update_offer_id.length) {
      throw new Error('Не переданы данные для обновления offer_id');
    }
    return this.request('/v1/product/update/offer-id', {
      update_offer_id
    });
  }
}

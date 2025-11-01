// src/services/ozon-api.js
import { BaseHttpClient } from './base-http-client';

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

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `OZON API error: ${response.status}`);
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

  async copyProduct(sourceOfferId, newOfferId, modifications = {}) {
    const body = {
      source_offer_id: sourceOfferId,
      new_offer_id: newOfferId,
      modifications
    };
    return this.request('/v3/product/import', body);
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
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Не переданы товары для обновления');
    }

    const normalizedItems = items
      .map((item) => {
        const offerId = item.offer_id || item.offerId;
        const prepared = {
          ...item,
          offer_id: offerId
        };

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

              return {
                id,
                values
              };
            })
            .filter(Boolean);
        }

        return prepared;
      })
      .filter(
        (item) =>
          item.offer_id &&
          Array.isArray(item.attributes) &&
          item.attributes.length > 0
      );

    if (!normalizedItems.length) {
      throw new Error('Нет атрибутов для обновления');
    }

    return this.createProductsBatch(normalizedItems);
  }
}

export class OzonApiService {
  constructor(apiKey, clientId) {
    // 🔥 ЯВНО УКАЗЫВАЕМ, что на сервере используем только переданные аргументы
    if (typeof window === 'undefined') {
      // Серверная среда - используем только переданные аргументы
      if (!apiKey || !clientId) {
        throw new Error('OZON API credentials are required for server-side usage.');
      }
      this.apiKey = apiKey;
      this.clientId = clientId;
    } else {
      // Клиентская среда - используем логику с localStorage
      const config = this.getCurrentConfig();

      if (!config.clientId || !config.apiKey) {
        throw new Error('OZON API credentials are required. Please add a profile in settings.');
      }

      this.apiKey = config.apiKey;
      this.clientId = config.clientId;
    }

    this.baseURL = 'https://api-seller.ozon.ru';
  }

  getCurrentConfig() {
    if (typeof window === 'undefined') {
      // На сервере - возвращаем пустые значения
      return { clientId: '', apiKey: '' };
    }

    const currentProfile = JSON.parse(localStorage.getItem('currentOzonProfile') || 'null');
    if (currentProfile) {
      return {
        clientId: currentProfile.ozon_client_id,
        apiKey: currentProfile.ozon_api_key
      };
    }

    // Пробуем взять из env переменных (для fallback)
    return {
      clientId: process.env.NEXT_PUBLIC_OZON_CLIENT_ID || '',
      apiKey: process.env.NEXT_PUBLIC_OZON_API_KEY || ''
    };
  }

  async makeRequest(endpoint, body = {}) {
    console.log(`🔄 Making request to: ${endpoint}`);
    console.log('📦 Request body:', JSON.stringify(body, null, 2));

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Client-Id': this.clientId,
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      console.log(`📊 Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ API Error ${response.status}:`, errorText);
        throw new Error(`OZON API Error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ Request successful');
      return data;
    } catch (error) {
      console.error('❌ Fetch error:', error.message);
      throw error;
    }
  }

  // Метод для получения заказов (если нужен)
  async getOrders() {
    return this.makeRequest('/v2/order/list', {
      filter: {},
      limit: 10,
      sort_by: 'created_at',
      sort_order: 'desc'
    });
  }

  // НОВЫЙ МЕТОД: Получение списка продуктов
  async getProducts(options = {}) {
    const body = {
      filter: {
        offer_id: options.filter?.offer_id || [], // Should be an array
        product_id: options.filter?.product_ids || [],
        visibility: options.filter?.visibility || "ALL"
      },
      last_id: options.last_id || "",
      limit: options.limit || 100
    };
    console.log('Sending request body to OZON:', JSON.stringify(body, null, 2));
    return this.makeRequest('/v3/product/list', body);
  }

  async getProductAttributes(offerId) {
    const body = {
      filter: {
        offer_id: [offerId] // Массив с одним offer_id
      },
      limit: 1
    };

    console.log('📋 Fetching attributes for offer:', offerId);
    return this.makeRequest('/v4/product/info/attributes', body);
  }

  async copyProduct(sourceOfferId, newOfferId, modifications = {}) {
    console.log(`📋 Copying product from ${sourceOfferId} to ${newOfferId}`);

    try {
      // 1. Получаем данные исходного товара
      const sourceAttributes = await this.getProductAttributes(sourceOfferId);

      if (!sourceAttributes.result || sourceAttributes.result.length === 0) {
        throw new Error('Source product not found');
      }

      const sourceProduct = sourceAttributes.result[0];

      // 2. Подготавливаем данные для нового товара
      const newProductData = this.prepareProductData(sourceProduct, newOfferId, modifications);

      // 3. Создаем новый товар
      return await this.createProduct(newProductData);
    } catch (error) {
      console.error('Error copying product:', error);
      throw error;
    }
  }

  async createProduct(productData) {
    const body = {
      items: [productData]
    };

    console.log('🆕 Creating new product:', JSON.stringify(body, null, 2));
    return this.makeRequest('/v3/product/import', body);
  }

  prepareProductData(sourceProduct, newOfferId, modifications) {
    // Базовые данные из исходного товара
    const newProduct = {
      offer_id: newOfferId,
      name: modifications.name || sourceProduct.name,
      category_id: sourceProduct.description_category_id,
      price: modifications.price || "0",
      old_price: modifications.old_price || "0",
      premium_price: modifications.premium_price || "0",
      vat: "0"
    };

    // Обрабатываем атрибуты
    if (sourceProduct.attributes) {
      newProduct.attributes = this.processAttributes(
        sourceProduct.attributes,
        modifications
      );
    }

    // Обрабатываем изображения
    if (sourceProduct.images && sourceProduct.images.length > 0) {
      newProduct.images = sourceProduct.images.map((image, index) => ({
        file_name: image,
        default: index === 0
      }));
    }

    // Добавляем размеры и вес, если есть
    if (sourceProduct.depth) newProduct.depth = sourceProduct.depth;
    if (sourceProduct.height) newProduct.height = sourceProduct.height;
    if (sourceProduct.width) newProduct.width = sourceProduct.width;
    if (sourceProduct.weight) newProduct.weight = sourceProduct.weight;
    if (sourceProduct.dimension_unit) newProduct.dimension_unit = sourceProduct.dimension_unit;
    if (sourceProduct.weight_unit) newProduct.weight_unit = sourceProduct.weight_unit;

    // Применяем дополнительные модификации
    Object.keys(modifications).forEach(key => {
      if (!['name', 'price', 'old_price', 'premium_price'].includes(key)) {
        newProduct[key] = modifications[key];
      }
    });

    return newProduct;
  }

  processAttributes(attributes, modifications) {
    return attributes.map(attr => {
      const attributeCopy = { ...attr };

      // Применяем модификации к определенным атрибутам
      if (modifications.color && this.isColorAttribute(attr)) {
        attributeCopy.values = [{ value: modifications.color }];
      }

      if (modifications.description && this.isDescriptionAttribute(attr)) {
        attributeCopy.values = [{ value: modifications.description }];
      }

      // Добавьте другие обработки атрибутов по необходимости

      return attributeCopy;
    });
  }

  isColorAttribute(attr) {
    // Определяем, является ли атрибут цветом (зависит от вашей структуры атрибутов)
    const colorKeywords = ['color', 'цвет', 'colore', 'farbe'];
    return colorKeywords.some(keyword =>
      attr.id.toString().toLowerCase().includes(keyword) ||
      (attr.values && attr.values.some(v =>
        v.value && v.value.toLowerCase().includes(keyword)
      ))
    );
  }

  isDescriptionAttribute(attr) {
    // Определяем, является ли атрибут описанием
    const descriptionKeywords = ['description', 'описание', 'beschreibung'];
    return descriptionKeywords.some(keyword =>
      attr.id.toString().toLowerCase().includes(keyword)
    );
  }
  // Упрощенный метод для быстрого получения продуктов
  // В методе, который делает запрос к /v3/product/list
  async getSimpleProducts(limit) {
    try {
      const url = `${this.baseURL}/v3/product/list`;
      const body = {
        filter: {
          offer_id: [],
          product_id: [],
          visibility: "ALL"
        },
        last_id: "",
        limit: limit
      };

      console.log('🚀 Sending request to OZON API...');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Client-Id': this.clientId,
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`OZON API error: ${response.status} - ${responseText}`);
      }

      // Парсим JSON
      const data = JSON.parse(responseText);

      if (data.result && data.result.items && Array.isArray(data.result.items)) {
        console.log(`✅ Extracted ${data.result.items.length} products from result.items`);
        return data.result.items; // <- Возвращаем массив продуктов
      } else {
        console.warn('⚠️ Unexpected response structure, returning empty array');
        return [];
      }

    } catch (error) {
      console.error('❌ OZON API request failed:', error);
      throw error;
    }
  }

  // Метод для массового создания товаров
  async createProductsBatch(products) {
    const body = {
      items: products
    };

    console.log('🆕 Creating products batch:', JSON.stringify(body, null, 2));
    return this.makeRequest('/v2/product/import', body);
  }

  // Метод для создания одного товара
  async createProduct(productData) {
    const body = {
      items: [productData]
    };

    console.log('🆕 Creating product:', JSON.stringify(body, null, 2));
    return this.makeRequest('/v2/product/import', body);
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
}
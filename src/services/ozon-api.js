export class OzonApiService {
  constructor(apiKey, clientId) {
    if (!apiKey || !clientId) {
      throw new Error('OZON API credentials are required');
    }

    this.apiKey = apiKey;
    this.clientId = clientId;
    this.baseURL = 'https://api-seller.ozon.ru';
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
  async getSimpleProducts(limit = 10) {
    return this.getProducts({
      filter: {
        visibility: "ALL"
      },
      limit: limit
    });
  }
}
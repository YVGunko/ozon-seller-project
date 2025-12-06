import {
  buildAiInputsFromProduct,
  buildRichJsonPrompt,
  buildSeoNamePrompt
} from './aiHelpers';

describe('buildAiInputsFromProduct', () => {
  test('mode=rich: filters out rich-content attributes', () => {
    const product = {
      offer_id: 'SKU-1',
      name: 'Кухонный топорик',
      attributes: {
        'Rich-контент JSON': 'старое значение rich-контента',
        'rich content': 'legacy rich content',
        'Описание': 'Нержавеющая сталь, длина 28 см'
      }
    };

    const { products } = buildAiInputsFromProduct(product, { mode: 'rich' });

    expect(Array.isArray(products)).toBe(true);
    expect(products).toHaveLength(1);

    const row = products[0];
    const keys = Object.keys(row);

    // Полезный атрибут остаётся
    expect(keys).toContain('Описание');

    // Атрибуты rich-контента должны быть отфильтрованы
    const hasRichKeys = keys.some((key) =>
      key.toLowerCase().includes('rich-контент') ||
      key.toLowerCase().includes('rich content')
    );
    expect(hasRichKeys).toBe(false);
  });

  test('удаляет служебные поля и сохраняет человекочитаемую категорию/тип', () => {
    const product = {
      offer_id: 'SKU-55',
      id: 'db-id',
      name: 'Напольная ваза',
      brand: 'InHouse',
      category_id: 123456,
      type_id: 999,
      category_name: 'Домашний декор',
      type_name: 'Напольные вазы',
      price: 12990,
      net_price: 10000,
      old_price: 14990,
      min_price: 9990,
      vat: '20',
      section: 'internal-only',
      withWatermark: true,
      watermarkText: 'LOGO',
      templateValues: { name: 'template-field' },
      createdAt: '2024-01-01T00:00:00Z',
      updated_at: '2024-02-02T00:00:00Z',
      custom_note: 'подходит для современных интерьеров',
      attributes: {
        'Материал': 'Керамика, ручная работа',
        'Цвет товара': 'Белый',
        'Страна производства': 'Россия',
        '#Хештеги': '#ваза #декор',
        'Rich-контент JSON': '{ "obsolete": true }'
      },
      seo_keywords: ['напольная ваза', 'керамика']
    };

    const { products, keywords } = buildAiInputsFromProduct(product, {
      mode: 'slides'
    });

    expect(Array.isArray(products)).toBe(true);
    const row = products[0];

    // Служебных полей быть не должно
    [
      'offer_id',
      'id',
      'category_id',
      'type_id',
      'price',
      'net_price',
      'old_price',
      'min_price',
      'vat',
      'section',
      'withWatermark',
      'watermarkText',
      'createdAt',
      'updated_at'
    ].forEach((key) => {
      expect(Object.prototype.hasOwnProperty.call(row, key)).toBe(false);
    });

    // Но человекочитаемые названия и ключевые атрибуты остаются
    expect(row).toMatchObject({
      name: 'Напольная ваза',
      brand: 'InHouse',
      category_name: 'Домашний декор',
      type_name: 'Напольные вазы',
      keywords_text: 'напольная ваза, керамика',
      material: 'Керамика, ручная работа',
      color: 'Белый',
      country: 'Россия'
    });

    expect(row).not.toHaveProperty('custom_note');

    // Полезные атрибуты остаются в whitelisted полях, хештеги и rich — нет
    expect(row).not.toHaveProperty('Материал');
    expect(row).not.toHaveProperty('#Хештеги');
    expect(row).not.toHaveProperty('Rich-контент JSON');

    // keywords сворачиваются в одну строку
    expect(keywords).toBe('напольная ваза, керамика');
  });

  test('mode=hashtags добавляет contextPrice при наличии цены', () => {
    const product = {
      name: 'Фитнес-гантели',
      brand: 'SportPro',
      category_name: 'Спорттовары',
      type_name: 'Гантели',
      price: '2590.50',
      attributes: {
        'Вес, кг': '2x3',
        'Материал': 'Сталь, неопрен',
        'Стиль': 'Hi-Tech'
      }
    };

    const { products } = buildAiInputsFromProduct(product, { mode: 'hashtags' });
    const row = products[0];

    expect(row).toHaveProperty('contextPrice', '2590.5');
    expect(row).toHaveProperty('material', 'Сталь, неопрен');
    expect(row).toHaveProperty('style', 'Hi-Tech');
    expect(row).not.toHaveProperty('price');
  });

  test('не включает images в products row', () => {
    const product = {
      name: 'Тестовый товар',
      images: [
        'https://example.com/img1.jpg',
        'https://example.com/img2.jpg'
      ],
      attributes: {
        'Описание': 'Нержавеющая сталь, длина 28 см'
      }
    };

    const { products } = buildAiInputsFromProduct(product, { mode: 'seo-name' });

    expect(Array.isArray(products)).toBe(true);
    expect(products).toHaveLength(1);

    const row = products[0];
    expect(row).not.toHaveProperty('images');
  });

  test('SEO-name промпт не содержит URL изображений', () => {
    const product = {
      name: 'Тестовый товар',
      category_name: 'Категория',
      type_name: 'Тип',
      images: [
        'https://example.com/img1.jpg',
        'https://example.com/img2.jpg'
      ],
      attributes: {
        'Описание': 'Нержавеющая сталь, длина 28 см'
      }
    };

    const { products, baseProductData, keywords } = buildAiInputsFromProduct(product, {
      mode: 'seo-name'
    });

    const prompt = buildSeoNamePrompt({ products, baseProductData, keywords });

    expect(prompt).toHaveProperty('user');
    expect(prompt.user).not.toContain('https://example.com/img1.jpg');
    expect(prompt.user).not.toContain('https://example.com/img2.jpg');
  });
});

describe('buildRichJsonPrompt', () => {
  function buildSamplePrompt() {
    const product = {
      offer_id: 'SKU-1',
      name: 'Кухонный топорик для мяса',
      price: 950,
      category_id: 17027907,
      images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      attributes: {
        'Материал': 'Нержавеющая сталь',
        'Длина, см': '28',
        'Rich-контент JSON': 'старое значение rich-контента'
      }
    };

    const { products, baseProductData } = buildAiInputsFromProduct(product, {
      mode: 'rich'
    });

    return buildRichJsonPrompt({ products, baseProductData });
  }

  test('system prompt is generic and does not mention attribute id', () => {
    const prompt = buildSamplePrompt();
    const { system } = prompt;

    expect(system).toContain('Rich-контент JSON для Ozon');
    expect(system).toContain('{ "content": [...], "version": 0.3 }');
    expect(system).not.toMatch(/11254/);
  });

  test('user prompt содержит жёсткий JSON-шаблон и контекст товара', () => {
    const prompt = buildSamplePrompt();
    const { user } = prompt;

    // Есть жёстко зашитый пример структуры
    expect(user).toContain('"widgetName": "raShowcase"');
    expect(user).toContain('"widgetName": "raTextBlock"');
    expect(user).toContain('"version": 0.3');

    // Есть человекочитаемые подписи блоков и контекст
    expect(user).toContain('Ключевые преимущества товара');
    // Заголовок третьего блока внутри JSON
    expect(user).toContain('Рекомендации по установке и использованию');
    expect(user).toContain('Данные товаров:');

    // В prompt попадает фактическое имя товара
    expect(user).toContain('Кухонный топорик для мяса');

    // Для Rich-промпта теперь передаём ссылки на изображения
    expect(user).toContain('https://example.com/img1.jpg');
    expect(user).toContain('https://example.com/img2.jpg');
  });
});

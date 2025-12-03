import {
  buildAiInputsFromProduct,
  buildRichJsonPrompt
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
});

describe('buildRichJsonPrompt', () => {
  function buildSamplePrompt() {
    const product = {
      offer_id: 'SKU-1',
      name: 'Кухонный топорик для мяса',
      price: 950,
      category_id: 17027907,
      images: 'https://example.com/img1.jpg, https://example.com/img2.jpg',
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
  });
});

// src/utils/aiHelpers.js

import { runReplicate } from './replicateClient';
import { normalizeImageList } from './imageHelpers';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL =
  process.env.GROQ_MODEL ||
  process.env.GROQ_DEFAULT_MODEL ||
  'groq/compound';

// Экспортируем фактически используемую модель Groq,
// чтобы другие модули (например, ai-storage) могли
// логировать корректное имя без дублирования логики.
export const GROQ_MODEL_IN_USE = DEFAULT_MODEL;

/**
 * Универсальный вызов Groq Chat API
 */
async function callGroqChat({ system, user, temperature = 0.5, maxTokens = 1024 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY не задан в переменных окружения');
  }

  const payload = {
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature,
    max_tokens: maxTokens
  };

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || 'Ошибка при обращении к Groq API';
    throw new Error(message);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Пустой ответ от модели Groq');
  }

  return content;
}

// Отладочный экспорт для серверных сравнений (не использовать на клиенте)
export async function debugGroqCall(params) {
  return callGroqChat(params);
}

/**
 * Универсальный вызов Replicate для SEO‑модели (openai/gpt‑5 и др.)
 * Возвращает "сырой" текстовый контент, который затем можно распарсить
 * через parseJsonFromModel.
 */
async function callReplicateSeo({ system, user, maxTokens = 2048 }) {
  const version =
    process.env.REPLICATE_SEO_MODEL ||
    process.env.REPLICATE_DEFAULT_SEO_MODEL;
  if (!version) {
    throw new Error(
      'REPLICATE_DEFAULT_SEO_MODEL / REPLICATE_SEO_MODEL не задан в переменных окружения'
    );
  }

  const input = {
    system_prompt: system || null,
    messages: [{ role: 'user', content: user }],
    verbosity: 'medium',
    reasoning_effort: 'minimal',
    max_completion_tokens: maxTokens
  };

  const prediction = await runReplicate({
    version,
    input,
    pollIntervalMs: 1500,
    timeoutMs: 3 * 60 * 1000
  });

  const out = prediction?.output;
  if (typeof out === 'string') {
    return out;
  }
  if (Array.isArray(out)) {
    return out
      .map((item) =>
        typeof item === 'string' ? item : JSON.stringify(item, null, 2)
      )
      .join('\n');
  }
  if (out && typeof out === 'object') {
    if (Array.isArray(out.choices) && out.choices[0]?.message?.content) {
      const content = out.choices[0].message.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const first = content[0];
        if (typeof first === 'string') return first;
        if (first && typeof first === 'object' && first.text) {
          return String(first.text);
        }
      }
    }
    return JSON.stringify(out, null, 2);
  }
  throw new Error('Пустой ответ от Replicate SEO‑модели');
}

// Отладочный экспорт для серверных сравнений (не использовать на клиенте)
export async function debugReplicateSeoCall(params) {
  return callReplicateSeo(params);
}

/**
 * Попытаться вытащить JSON из ответа модели
 */
function parseJsonFromModel(text) {
  if (!text) {
    throw new Error('Пустой текст для парсинга');
  }
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Попробуем вытащить JSON из блока ```json ... ```
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      const candidate = fenced[1].trim();
      try {
        return JSON.parse(candidate);
      } catch {
        // игнорируем и пойдём к следующей эвристике
      }
    }

    // Общий случай — пытаемся вытащить ПЕРВЫЙ законченный JSON-объект { ... }
    // Даже если после него модель добавила комментарии / объяснения.
    const firstBrace = trimmed.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      for (let i = firstBrace; i < trimmed.length; i += 1) {
        const ch = trimmed[i];
        if (ch === '{') {
          depth += 1;
        } else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            const candidate = trimmed.slice(firstBrace, i + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              // eslint-disable-next-line no-console
              console.error(
                '[aiHelpers] parseJsonFromModel: failed to parse candidate JSON object',
                candidate
              );
            }
            break;
          }
        }
      }
    }

    // Аналогично поддержим случай, когда модель вернула массив `[...]` с хвостом
    const firstBracket = trimmed.indexOf('[');
    if (firstBracket !== -1) {
      let depth = 0;
      for (let i = firstBracket; i < trimmed.length; i += 1) {
        const ch = trimmed[i];
        if (ch === '[') {
          depth += 1;
        } else if (ch === ']') {
          depth -= 1;
          if (depth === 0) {
            const candidate = trimmed.slice(firstBracket, i + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              // eslint-disable-next-line no-console
              console.error(
                '[aiHelpers] parseJsonFromModel: failed to parse candidate JSON array',
                candidate
              );
            }
            break;
          }
        }
      }
    }
  }
  throw new Error('Не удалось распарсить JSON из ответа модели');
}

/**
 * Описание объекта в виде "ключ: значение" по строкам
 */
function describeObject(obj, options = {}) {
  const { excludeKeys = [] } = options;
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj)
    .filter(([key, value]) => !excludeKeys.includes(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

/**
 * Грубое удаление HTML‑тегов и лишних пробелов
 */
function stripHtml(input) {
  if (input === null || input === undefined) return '';
  const withoutTags = String(input).replace(/<\/?[^>]+>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

/**
 * Подготовка текстового контекста по товарам
 * products: [{ index, templateValues?, ...произвольные поля }]
 * options:
 *   - includeImages: boolean — добавлять ли блок с изображениями
 *   - maxImages: number — максимум ссылок на изображения
 */
function buildProductsContext(products = [], options = {}) {
  const { includeImages = false, maxImages = 8 } = options || {};

  return products
    .slice(0, 50)
    .map((row) => {
      const templateValues = row.templateValues || {};
      const sanitizedRow = { ...row };
      let imagesBlock = '';

      if (includeImages && Array.isArray(row.images) && row.images.length) {
        const limited = row.images.slice(0, maxImages);
        imagesBlock = [
          'Изображения:',
          ...limited.map((url) => `- ${url}`)
        ].join('\n');
      }

      delete sanitizedRow.images;
      const header = typeof row.index === 'number' ? `#${row.index + 1}` : '#товар';
      const parts = [
        header,
        templateValues.name && `Название: ${templateValues.name}`,
        templateValues.part_number && `Партномер: ${templateValues.part_number}`,
        imagesBlock,
        // Универсальное описание остальных полей
        describeObject(sanitizedRow, { excludeKeys: ['index', 'templateValues'] })
      ]
        .filter(Boolean)
        .join('\n');

      return parts;
    })
    .join('\n\n');
}

function buildKeyAttributesSection(baseProductData = {}) {
  if (!baseProductData || typeof baseProductData !== 'object') return '';
  const entries = [];
  if (baseProductData.material) entries.push(`Материал: ${baseProductData.material}`);
  if (baseProductData.size) entries.push(`Размер: ${baseProductData.size}`);
  if (baseProductData.color) entries.push(`Цвет: ${baseProductData.color}`);
  if (baseProductData.purpose) entries.push(`Назначение: ${baseProductData.purpose}`);
  if (baseProductData.style) entries.push(`Стиль: ${baseProductData.style}`);
  if (baseProductData.country) entries.push(`Страна: ${baseProductData.country}`);
  if (!entries.length) return '';
  return ['Ключевые характеристики:', ...entries].join('\n');
}

/**
 * Нормализация базовых данных товара
 * (можно использовать перед отправкой в другие функции)
 */
export function normalizeProductData(raw = {}) {
  const normalized = { ...raw };

  if (normalized.price != null) {
    const num = Number(
      typeof normalized.price === 'string'
        ? normalized.price.replace(',', '.')
        : normalized.price
    );
    if (Number.isFinite(num)) normalized.price = num.toString();
    else delete normalized.price;
  }

  if (normalized.category_id != null) {
    normalized.category_id = String(normalized.category_id).trim();
  }

  if (normalized.vat != null) {
    normalized.vat = String(normalized.vat).trim();
  }

  if (normalized.section != null) {
    normalized.section = String(normalized.section).trim();
  }

  return normalized;
}

/**
 * Построение входных данных для AI из универсального объекта product
 *
 * product: {
 *   offer_id, name, category_id, type_id, brand,
 *   images, price, vat, section,
 *   attributes: { [key]: value },
 *   seo_keywords, withWatermark, watermarkText, ...
 * }
 */
export function buildAiInputsFromProduct(product = {}, options = {}) {
  if (!product || typeof product !== 'object') {
    throw new Error('product is required');
  }

  const mode = typeof options.mode === 'string' ? options.mode.toLowerCase() : '';

  const {
    name,
    brand,
    seo_keywords,
    attributes,
    images,
    withWatermark,
    watermarkText,
    price,
    category_name,
    category_label,
    category_display,
    categoryName,
    description_category_name,
    type_name,
    type_label,
    type_display,
    typeName
  } = product;

  const attributesFlat = {};
  const keyAttributes = {};

  const toAttributeString = (rawValue) => {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return '';
    }
    if (Array.isArray(rawValue)) {
      return rawValue
        .map((item) => (item === null || item === undefined ? '' : String(item)))
        .filter(Boolean)
        .join(', ');
    }
    if (typeof rawValue === 'object') {
      return describeObject(rawValue);
    }
    return String(rawValue);
  };

  if (attributes && typeof attributes === 'object') {
    const unhandledAttributes = [];
    Object.entries(attributes).forEach(([key, value]) => {
      const lowerKey = String(key || '').toLowerCase();

       const canonicalKey = detectKeyAttributeName(lowerKey);
       if (canonicalKey && !keyAttributes[canonicalKey]) {
         const normalized = toAttributeString(value);
         if (normalized) {
           keyAttributes[canonicalKey] = normalized;
         }
         return;
       }

      if (mode === 'hashtags') {
        // Не подсказываем модели уже существующие хештеги
        if (lowerKey.includes('#хештеги') || lowerKey.includes('#hashtags')) {
          return;
        }
      }
      if (mode === 'rich' || mode === 'slides') {
        // Не подсказываем существующий rich-контент
        if (
          lowerKey.includes('rich-контент') ||
          lowerKey.includes('rich content') ||
          lowerKey.includes('rich-контент json')
        ) {
          return;
        }
      }
      if (
        mode === 'seo-name' ||
        mode === 'title' ||
        mode === 'description' ||
        mode === 'slides'
      ) {
        // Для текстовых задач тоже можно не мешать текущими rich / хештегами
        if (
          lowerKey.includes('#хештеги') ||
          lowerKey.includes('#hashtags') ||
          lowerKey.includes('rich-контент') ||
          lowerKey.includes('rich content') ||
          lowerKey.includes('rich-контент json')
        ) {
          return;
        }
      }
      const normalized = toAttributeString(value);
      if (!normalized) return;
      attributesFlat[key] = normalized;
      unhandledAttributes.push({ name: key, value: normalized });
    });

    // TODO: сложить эти атрибуты в отдельный блок otherAttributes и передавать в LLM отдельно
  }

  // Плоское текстовое представление оставшихся атрибутов
  const attributesFlatText = (() => {
    const entries =
      attributesFlat && typeof attributesFlat === 'object'
        ? Object.entries(attributesFlat)
        : [];
    if (!entries.length) return '';

    const lines = entries
      .filter(([key]) => {
        const k = String(key || '').toLowerCase();
        if (!k) return false;
        // Исключаем поля, которые уже передаются отдельно
        // или содержат "шумный" rich/seo‑контент.
        if (k === 'бренд' || k.startsWith('бренд ')) return false;
        if (k === 'название' || k.startsWith('название ')) return false;
        if (k.includes('rich-контент') || k.includes('rich content')) return false;
        if (k.includes('#хештеги') || k.includes('#hashtags')) return false;
        if (k.includes('seo-название')) return false;
        if (k.includes('варианты seo')) return false;
        if (k.includes('аннотац')) return false;
        return true;
      })
      .map(([key, value]) => {
        const clean = stripHtml(value);
        if (!clean) return null;
        return `${key}: ${clean}`;
      })
      .filter(Boolean);

    return lines.length ? lines.join('\n') : '';
  })();

  const keywordsText =
    Array.isArray(seo_keywords) ? seo_keywords.join(', ') : (seo_keywords || '');

  const categoryText =
    category_display ||
    category_label ||
    category_name ||
    categoryName ||
    description_category_name ||
    '';
  const typeText =
    type_display || type_label || type_name || typeName || '';

  let contextPrice = null;
  if (price !== undefined && price !== null && price !== '') {
    const numericPrice = Number(
      typeof price === 'string' ? price.replace(',', '.') : price
    );
    if (Number.isFinite(numericPrice) && numericPrice > 0) {
      contextPrice = numericPrice.toString();
    }
  }

  // Для Rich‑режима дополнительно готовим список изображений (только URL)
  let richImages = [];
  if (mode === 'rich' && images) {
    const normalizedImages = normalizeImageList(images);
    if (normalizedImages.length) {
      const MAX_RICH_IMAGES = 8;
      richImages = normalizedImages.slice(0, MAX_RICH_IMAGES);
    }
  }

  const productRow = {
    index: 0,
    templateValues: {
      name: name || ''
    },
    name,
    brand,
    category_name: categoryText,
    type_name: typeText,
    keywords_text: keywordsText,
    ...keyAttributes,
    ...attributesFlat
  };

  if (richImages.length) {
    productRow.images = richImages;
  }

  if (mode === 'hashtags' && contextPrice) {
    productRow.contextPrice = contextPrice;
  }

  const baseProductData = normalizeProductData({
    category: categoryText || undefined,
    type: typeText || undefined,
    brand: brand || undefined,
    ...keyAttributes
  });

  const keywords = keywordsText;

  const aiInputs = {
    products: [productRow],
    baseProductData,
    keywords,
    attributesFlat: attributesFlatText
  };

  return {
    ...aiInputs,
    withWatermark: Boolean(withWatermark),
    watermarkText: watermarkText || ''
  };
}

/**
 * Построение промпта для SEO-названий
 */
export function buildSeoNamePrompt({ products, keywords, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации SEO-названий');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);
  const keyAttributesSection = buildKeyAttributesSection(baseProductData);
  const kws =
    Array.isArray(keywords) ? keywords.join(', ') : (keywords || 'не заданы');

  const system = `
Ты профессиональный SEO-специалист компании «Ашманов и партнёры».
Ты создаёшь SEO-названия для карточек товаров на маркетплейсе Ozon.
Всегда отвечай строго в формате JSON.
`;

  const user = [
    'Для КАЖДОГО товара сделай ТРИ РАЗНЫХ SEO-названия товара для маркетплейса Ozon.',
    'Цель: чтобы карточка попадала как можно выше конкурентов в выдаче по релевантным запросам.',
    'Требования к каждому названию:',
    '- язык: русский;',
    '- длина: не более 120 символов;',
    '- отразить тип товара, ключевые характеристики и выгоды покупателя;',
    '- использовать важные ключевые фразы, но без спама и переспама;',
    '- избегать прямых повторов между вариантами;',
    '- не использовать кавычки, эмодзи и лишние знаки препинания;',
    '- не добавлять ссылки на источники или сайты;',
    '- не добавлять номера вроде "(1)" или "- 1" внутрь названий.',
    '',
    `Ключевые слова: ${kws}.`,
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    keyAttributesSection,
    '',
    'Данные товаров:',
    productsContext,
    '',
    'Верни ответ строго в JSON формате без лишнего текста и пояснений:',
    '{"descriptions":[{"index":0,"titles":["вариант1","вариант2","вариант3"]}, ...]}'
  ]
    .filter(Boolean)
    .join('\n');
  return {
    system,
    user,
    temperature: 0.7,
    maxTokens: 900
  };
}

/**
 * Генерация SEO-названий с произвольным заранее подготовленным промптом.
 * Использует ту же схему ответа, что и generateSEOName.
 *
 * @param {Object} params
 * @param {Object[]} params.products
 * @param {string|string[]} [params.keywords]
 * @param {Object} params.baseProductData
 * @param {{ system: string, user: string, temperature?: number, maxTokens?: number }} params.prompt
 * @returns {Promise<Array<{ index: number, titles: string[] }>>}
 */
export async function generateSEONameWithPrompt({
  products,
  keywords,
  baseProductData,
  prompt
}) {
  if (!prompt || !prompt.system || !prompt.user) {
    throw new Error('generateSEONameWithPrompt: prompt.system и prompt.user обязательны');
  }

  const temperature =
    typeof prompt.temperature === 'number' ? prompt.temperature : 0.7;
  const maxTokens =
    typeof prompt.maxTokens === 'number' ? prompt.maxTokens : 900;

  const content = await callGroqChat({
    system: prompt.system,
    user: prompt.user,
    temperature,
    maxTokens
  });

  const parsed = parseJsonFromModel(content);
  let descriptions = Array.isArray(parsed?.descriptions)
    ? parsed.descriptions
    : parsed;

  // Поддержка двух форматов:
  // 1) [{ index, titles: ["...", "..."] }]
  // 2) ["...", "...", "..."] — массив строк.
  if (Array.isArray(descriptions) && descriptions.length > 0) {
    if (typeof descriptions[0] === 'string') {
      const titles = descriptions
        .map((t) => String(t || '').trim())
        .filter(Boolean);
      return [
        {
          index: 0,
          titles
        }
      ];
    }
  }

  if (!Array.isArray(descriptions)) {
    throw new Error('Ответ модели не содержит массива descriptions');
  }

  return descriptions.map((item) => ({
    index: item.index,
    titles: Array.isArray(item.titles)
      ? item.titles.map((t) => String(t || '').trim()).filter(Boolean)
      : []
  }));
}

/**
 * Генерация SEO-названий для товаров (через Groq)
 * Возвращает: [{ index, titles: [t1, t2, t3] }]
 */
export async function generateSEOName({ products, keywords, baseProductData }) {
  const prompt = buildSeoNamePrompt({
    products,
    keywords,
    baseProductData
  });

  return generateSEONameWithPrompt({
    products,
    keywords,
    baseProductData,
    prompt
  });
}

/**
 * Построение промпта для SEO-описаний (аннотаций)
 */
export function buildSeoDescriptionPrompt({ products, keywords, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации SEO-описаний');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);
  const keyAttributesSection = buildKeyAttributesSection(baseProductData);
  const kws =
    Array.isArray(keywords) ? keywords.join(', ') : (keywords || 'не заданы');

  const system = `
Ты профессиональный SEO-специалист компании «Ашманов и партнёры».
Твоя задача — создавать SEO-описания для карточек товаров на маркетплейсе Ozon.
Всегда отвечай строго в формате JSON.
`;

  const user = [
    'Дано описание товара и его характеристики. Тебе нужно:',
    '',
    '1) Мысленно собрать релевантные ключевые фразы для этого товара так, как если бы ты снимал их с выдачи Ozon по этому товару.',
    '2) Разбить ключевые фразы (внутри себя, без вывода в ответе) на три группы:',
    '- высокочастотные;',
    '- среднечастотные;',
    '- низкочастотные.',
    '',
    '3) На основе этих групп и данных о товаре создать ТРИ РАЗНЫХ SEO-описания для карточки товара на Ozon.',
    '',
    'Требования к КАЖДОМУ описанию:',
    '- язык: русский;',
    '- длина: около 1700 символов (можно ±10% — но не менее 1400 и строго не более 2000 символов);',
    '- итоговый текст одного описания ДОЛЖЕН укладываться в ограничение Ozon по полю «Аннотация» — не более 6000 символов, поэтому не пиши чрезмерно длинные тексты;',
    '- описание должно помогать выводить карточку в ТОП по конкурентным запросам;',
    '- обязательно использовать высоко-, средне- и низкочастотные фразы, но без спама и переспама;',
    '- избегать «воды» и пустых фраз; писать как опытный SEO-копирайтер;',
    '- не использовать HTML, Markdown и эмодзи;',
    '- не вставлять списки формата "-", "*" или нумерацию — только чистый текст абзацами.',
    '- не используй в тексте слова и фразы типа "ключевые слова", "поисковые запросы", "высокочастотные / среднечастотные / низкочастотные запросы", "SEO-описание", "SEO", "частотность" и т.п.; думай о ключевых фразах, но не упоминай их как ключевые слова.',
    '',
    'В каждом описании делай акцент на выгодах для покупателя, сценариях использования и сильных сторонах товара относительно конкурентов.',
    '',
    `Ключевые слова от пользователя (если есть): ${kws}.`,
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    keyAttributesSection,
    '',
    'Данные товаров:',
    productsContext,
    '',
    'Формат ответа STRICT JSON:',
    '{"descriptions":[{"index":0,"text_variant_1":"...","text_variant_2":"...","text_variant_3":"..."}, ...]}'
  ]
    .filter(Boolean)
    .join('\n');
  return {
    system,
    user,
    temperature: 0.7,
    maxTokens: 2000
  };
}

/**
 * Генерация SEO-описаний (аннотаций) для товаров с произвольным промптом.
 * Возвращает: [{ index, texts: [вариант1, вариант2, ...] }]
 */
export async function generateSEODescriptionWithPrompt({
  products,
  keywords,
  baseProductData,
  prompt
}) {
  if (!prompt || !prompt.system || !prompt.user) {
    throw new Error(
      'generateSEODescriptionWithPrompt: prompt.system и prompt.user обязательны'
    );
  }

  const temperature =
    typeof prompt.temperature === 'number' ? prompt.temperature : 0.7;
  const maxTokens =
    typeof prompt.maxTokens === 'number' ? prompt.maxTokens : 2000;

  const content = await callGroqChat({
    system: prompt.system,
    user: prompt.user,
    temperature,
    maxTokens
  });

  const parsed = parseJsonFromModel(content);
  const descriptions = Array.isArray(parsed?.descriptions)
    ? parsed.descriptions
    : parsed;

  if (!Array.isArray(descriptions)) {
    throw new Error('Ответ модели не содержит массива descriptions');
  }

  return descriptions.map((item) => {
    const variants = [];
    if (typeof item.text === 'string' && item.text.trim()) {
      variants.push(String(item.text).trim());
    }
    const v1 = String(item.text_variant_1 || '').trim();
    const v2 = String(item.text_variant_2 || '').trim();
    const v3 = String(item.text_variant_3 || '').trim();
    if (v1) variants.push(v1);
    if (v2) variants.push(v2);
    if (v3) variants.push(v3);
    // убираем дубли, если модель вернула одинаковые варианты
    const unique = Array.from(new Set(variants));
    return {
      index: item.index,
      texts: unique
    };
  });
}

/**
 * Генерация SEO-описаний (аннотаций) для товаров (через Groq)
 * Возвращает: [{ index, texts: [...] }]
 */
export async function generateSEODescription({ products, keywords, baseProductData }) {
  const prompt = buildSeoDescriptionPrompt({
    products,
    keywords,
    baseProductData
  });

  return generateSEODescriptionWithPrompt({
    products,
    keywords,
    baseProductData,
    prompt
  });
}

/**
 * Построение промпта для хештегов (#Хештеги, атрибут 23171)
 */
export function buildHashtagsPrompt({ products, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации хештегов');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);
  const keyAttributesSection = buildKeyAttributesSection(baseProductData);

  const system = `
Ты формируешь атрибут "#Хештеги" для карточек Ozon.
Отвечай строго JSON.
`;

  const user = [
    'Для КАЖДОГО товара сгенерируй 10–25 хештегов для атрибута "#Хештеги" Ozon.',
    'Требования к каждому хештегу:',
    '- начинается с символа #;',
    '- содержит только буквы, цифры и символ подчеркивания;',
    '- если хештег из нескольких слов, используй нижнее подчеркивание (#черный_металлик);',
    '- длина хештега — не более 30 символов;',
    '- часть хештегов ДОЛЖНА быть на русском языке (только кириллица + цифры + подчеркивание), часть может быть на латинице/транслите;',
    '- не дублируй название бренда и точное название товара слишком часто;',
    '- избегай общего мусора типа #скидки #цена;',
    '- фокусируйся на назначении, типе товара, стиле, сценариях использования.',
    '',
    'Формат ответа STRICT JSON:',
    '{"hashtags":[{"index":0,"values":["#пример1","#пример2", ...]}, ...]}',
    '',
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    keyAttributesSection,
    '',
    'Данные товаров:',
    productsContext
  ]
    .filter(Boolean)
    .join('\n');
  return {
    system,
    user,
    temperature: 0.6,
    maxTokens: 1200
  };
}

/**
 * Генерация хештегов для Ozon (#Хештеги, атрибут 23171) с произвольным промптом.
 * Возвращает: [{ index, hashtags: ["#пример", ...] }]
 */
export async function generateHashtagsWithPrompt({ products, baseProductData, prompt }) {
  if (!prompt || !prompt.system || !prompt.user) {
    throw new Error(
      'generateHashtagsWithPrompt: prompt.system и prompt.user обязательны'
    );
  }

  const temperature =
    typeof prompt.temperature === 'number' ? prompt.temperature : 0.6;
  const maxTokens =
    typeof prompt.maxTokens === 'number' ? prompt.maxTokens : 1200;

  const content = await callGroqChat({
    system: prompt.system,
    user: prompt.user,
    temperature,
    maxTokens
  });

  const parsed = parseJsonFromModel(content);
  const hashtags = Array.isArray(parsed?.hashtags) ? parsed.hashtags : parsed;

  if (!Array.isArray(hashtags)) {
    throw new Error('Ответ модели не содержит массива hashtags');
  }

  return hashtags.map((item) => ({
    index: item.index,
    hashtags: Array.isArray(item.values)
      ? item.values.map((h) => String(h || '').trim()).filter(Boolean)
      : []
  }));
}

export async function generateHashtags({ products, baseProductData }) {
  const prompt = buildHashtagsPrompt({
    products,
    baseProductData
  });

  return generateHashtagsWithPrompt({
    products,
    baseProductData,
    prompt
  });
}

/**
 * Нормализация Rich‑контента к схеме OZON:
 * { content: [...widgets], version: 0.3 }
 */
function normalizeOzonRichContent(value) {
  let base = value;
  if (!base || typeof base !== 'object') {
    try {
      base = JSON.parse(String(value || '{}'));
    } catch {
      base = {};
    }
  }
  const content = Array.isArray(base.content) ? base.content : [];
  const version =
    base.version !== undefined && base.version !== null ? base.version : 0.3;
  return { content, version };
}

export function buildRichJsonPrompt({ products, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации Rich-контента');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products, {
    includeImages: true,
    maxImages: 8
  });

  const system = `
Ты генерируешь Rich-контент JSON для Ozon.
Отвечай строго JSON, без пояснений.
Формат верхнего уровня ответа: { "content": [...], "version": 0.3 }.
Не добавляй комментарии, пояснения или текст вне JSON.
`;

  // Поле images исключено из LLM-запросов, поэтому явно сбрасываем ссылку на изображение.
  const primaryImageUrl = '';

  const user = [
    'Создай Rich-контент для карточки товара Ozon в формате JSON.',
    'Строгий формат ответа (без комментариев и пояснений):',
    '',
    '{',
    '  "content": [',
    '    {',
    '      "widgetName": "raShowcase",',
    '      "type": "billboard",',
    '      "blocks": [',
    '        {',
    '          "imgLink": "",',
    '          "img": {',
    `            "src": "${primaryImageUrl}",`,
    `            "srcMobile": "${primaryImageUrl}",`,
    '            "alt": "Краткое описание товара",',
    '            "position": "width_full",',
    '            "positionMobile": "width_full",',
    '            "widthMobile": 708,',
    '            "heightMobile": 708',
    '          },',
    '          "title": {',
    '            "content": ["Краткий главный заголовок блока"],',
    '            "size": "size4",',
    '            "align": "left",',
    '            "color": "color1"',
    '          },',
    '          "text": {',
    '            "size": "size2",',
    '            "align": "left",',
    '            "color": "color1",',
    '            "content": [',
    '              "Краткое введение в товар: что это, для чего, какие основные преимущества."',
    '            ]',
    '          }',
    '        }',
    '      ]',
    '    },',
    '    {',
    '      "widgetName": "raTextBlock",',
    '      "title": {',
    '        "content": ["Ключевые преимущества товара"],',
    '        "size": "size4",',
    '        "color": "color1"',
    '      },',
    '      "theme": "tertiary",',
    '      "padding": "type2",',
    '      "gapSize": "s",',
    '      "text": {',
    '        "size": "size2",',
    '        "align": "left",',
    '        "color": "color1",',
    '        "content": [',
    '          "• Преимущество 1 — коротко и по делу.",',
    '          "• Преимущество 2 — коротко и по делу.",',
    '          "• Преимущество 3 — коротко и по делу.",',
    '          "• Преимущество 4 — коротко и по делу."',
    '        ]',
    '      }',
    '    },',
    '    {',
    '      "widgetName": "raTextBlock",',
    '      "title": {',
    '        "content": ["Рекомендации по установке и использованию"],',
    '        "size": "size4",',
    '        "color": "color1"',
    '      },',
    '      "theme": "primary",',
    '      "padding": "type2",',
    '      "gapSize": "s",',
    '      "text": {',
    '        "size": "size2",',
    '        "align": "left",',
    '        "color": "color1",',
    '        "content": [',
    '          "1. Шаг установки №1.",',
    '          "2. Шаг установки №2.",',
    '          "3. Шаг установки №3.",',
    '          "4. Важные рекомендации по эксплуатации."',
    '        ]',
    '      }',
    '    }',
    '  ],',
    '  "version": 0.3',
    '}',
    '',
    'Требования:',
    '- язык: русский;',
    '- никаких HTML‑тегов;',
    '- не упоминать, что это JSON, в самих текстах;',
    '- тексты должны быть уникальными и описывать именно данный товар;',
    '- используй фактические характеристики, преимущества и сценарии использования.',
    '',
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    '',
    'Данные товаров:',
    productsContext
  ]
    .filter(Boolean)
    .join('\n');
  return {
    system,
    user,
    temperature: 0.6,
    maxTokens: 2500
  };
}

export async function generateRichJSONWithPrompt({ products, baseProductData, prompt }) {
  if (!prompt || !prompt.system || !prompt.user) {
    throw new Error(
      'generateRichJSONWithPrompt: prompt.system и prompt.user обязательны'
    );
  }

  const temperature =
    typeof prompt.temperature === 'number' ? prompt.temperature : 0.6;
  const maxTokens =
    typeof prompt.maxTokens === 'number' ? prompt.maxTokens : 2500;

  const content = await callGroqChat({
    system: prompt.system,
    user: prompt.user,
    temperature,
    maxTokens
  });

  const parsed = parseJsonFromModel(content);
  const normalized = normalizeOzonRichContent(parsed);

  return [
    {
      index: 0,
      content: normalized
    }
  ];
}

export async function generateRichJSON({ products, baseProductData }) {
  const prompt = buildRichJsonPrompt({
    products,
    baseProductData
  });

  return generateRichJSONWithPrompt({
    products,
    baseProductData,
    prompt
  });
}

/**
 * Построение промпта для структуры слайдов
 */
export function buildSlidesPrompt({ products, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации слайдов');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);

  const system = `
Ты команда профессионального дизайнерского агентства MaryCo.
Ты проектируешь промо-слайды для карточек товаров на маркетплейсе Ozon.
Отвечай строго в формате JSON-структуры слайдов.
`.trim();

  const user = [
    'Для КАЖДОГО товара создай РОВНО 5 отдельных промо-слайдов для карточки Ozon.',
    'Формат слайдов — 3:4 (вертикальная ориентация, как в карточках Ozon).',
    '',
    'Перед генерацией мысленно проанализируй конкурентов (аналогичные товары) и их визуальные решения:',
    '- какие УТП и преимущества они показывают;',
    '- какие слабые стороны конкурентов можно обойти;',
    '- какие сценарии использования и эмоции важны для покупателя.',
    '',
    'Выдели уникальное торговое предложение (УТП) нашего товара и построй вокруг него структуру слайдов.',
    '',
    'Каждый слайд описывается объектом с полями:',
    '{',
    '  "title": "краткий заголовок",',
    '  "subtitle": "дополнительное пояснение (может быть пустым)",',
    '  "overlay_title_ru": "короткий продающий заголовок НА РУССКОМ, кириллицей, без ошибок",',
    '  "overlay_subtitle_ru": "вторая строка текста на слайде, тоже на русском (может быть пустой)",',
    '  "bullets": ["краткий пункт 1","краткий пункт 2", ...],',
    '  "imageIdea": "что должно быть изображено на слайде (учитывая формат 3:4)",',
    '  "watermark": "текст или null"',
    '}',
    '',
    'Формат ответа STRICT JSON:',
    '{',
    '  "slides": [',
    '    {',
    '      "index": 0,',
    '      "slides": [',
    '        {',
    '          "title": "...",',
    '          "subtitle": "...",',
    '          "overlay_title_ru": "русский заголовок для текста на картинке",',
    '          "overlay_subtitle_ru": "русская вторая строка на картинке или пусто",',
    '          "bullets": ["..."],',
    '          "imageIdea": "...",',
    '          "watermark": "..."',
    '        },',
    '        ...',
    '      ]',
    '    }',
    '  ]',
    '}',
    '',
    'Требования:',
    '- язык: русский;',
    '- заголовки короткие, продающие;',
    '- bullets — 2–5 штук, без длинных предложений;',
    '- overlay_title_ru и overlay_subtitle_ru — обязаны быть на русском языке, кириллицей, без орфографических ошибок и без псевдослов;',
    '- imageIdea — одно-два предложения, что должно быть на картинке, с учётом формата 3:4 и УТП товара.',
    '',
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    '',
    'Данные товаров:',
    productsContext
  ]
    .filter(Boolean)
    .join('\n');

  return {
    system,
    user,
    temperature: 0.7,
    maxTokens: 3000
  };
}

/**
 * Генерация "слайдов" (структуры для слайдов/изображений) с произвольным промптом.
 * withWatermark: boolean — добавлять ли watermark
 * watermarkText: string — текст водяного знака (если слайдам требуется watermark)
 */
export async function generateSlidesWithPrompt({
  products,
  baseProductData,
  withWatermark = false,
  watermarkText = '',
  prompt
}) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации слайдов');
  }

  if (!prompt || !prompt.system || !prompt.user) {
    throw new Error(
      'generateSlidesWithPrompt: prompt.system и prompt.user обязательны'
    );
  }

  const content = await callGroqChat({
    system: prompt.system,
    user: prompt.user,
    temperature: 0.7,
    maxTokens: 3000
  });

  const parsed = parseJsonFromModel(content);
  const slidesArr = Array.isArray(parsed?.slides) ? parsed.slides : parsed;

  if (!Array.isArray(slidesArr)) {
    throw new Error('Ответ модели не содержит массива slides');
  }

  return slidesArr.map((item) => ({
    index: item.index,
    slides: Array.isArray(item.slides) ? item.slides : []
  }));
}

/**
 * Генерация "слайдов" (структуры для слайдов/изображений) с опциональным водяным знаком
 * withWatermark: boolean — добавлять ли watermark
 * watermarkText: string — текст водяного знака (если withWatermark = true)
 */
export async function generateSlides({
  products,
  baseProductData,
  withWatermark = false,
  watermarkText = ''
}) {
  const prompt = buildSlidesPrompt({ products, baseProductData });

  return generateSlidesWithPrompt({
    products,
    baseProductData,
    withWatermark,
    watermarkText,
    prompt
  });
}
const KEY_ATTRIBUTE_ALIASES = {
  material: [
    'материал',
    'материал корпуса',
    'основной материал',
    'материал товара'
  ],
  size: [
    'размер',
    'габариты',
    'размер товара',
    'размеры',
    'высота',
    'ширина',
    'длина',
    'габариты товара'
  ],
  color: [
    'цвет',
    'основной цвет',
    'цвет товара',
    'цвет изделия'
  ],
  purpose: [
    'назначение',
    'тип товара',
    'тип продукта',
    'тип использования',
    'область применения',
    'тип'
  ],
  style: [
    'стиль',
    'дизайн',
    'коллекция'
  ],
  country: [
    'страна',
    'страна производства',
    'страна бренда'
  ]
};

function detectKeyAttributeName(key) {
  if (!key) return null;
  const normalized = String(key).trim().toLowerCase();
  if (!normalized) return null;
  for (const [canonical, aliases] of Object.entries(KEY_ATTRIBUTE_ALIASES)) {
    if (
      aliases.some((alias) => normalized === alias || normalized.includes(alias))
    ) {
      return canonical;
    }
  }
  return null;
}

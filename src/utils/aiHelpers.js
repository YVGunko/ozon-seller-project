// src/utils/aiHelpers.js

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'llama3-70b-8192';

/**
 * Универсальный вызов Groq Chat API
 */
async function callGroqChat({ system, user, temperature = 0.5, maxTokens = 1024 }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY не задан в переменных окружения');
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature,
      max_tokens: maxTokens
    })
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
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
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
 * Подготовка текстового контекста по товарам
 * products: [{ index, templateValues?, ...произвольные поля }]
 */
function buildProductsContext(products = []) {
  return products
    .slice(0, 50)
    .map((row) => {
      const templateValues = row.templateValues || {};
      const header = typeof row.index === 'number' ? `#${row.index + 1}` : '#товар';
      const parts = [
        header,
        templateValues.name && `Название: ${templateValues.name}`,
        templateValues.part_number && `Партномер: ${templateValues.part_number}`,
        // Универсальное описание остальных полей
        describeObject(row, { excludeKeys: ['index', 'templateValues'] })
      ]
        .filter(Boolean)
        .join('\n');

      return parts;
    })
    .join('\n\n');
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
 * Генерация SEO-названий для товаров
 * Возвращает: [{ index, titles: [t1, t2, t3] }]
 */
export async function generateSEOName({ products, keywords, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации SEO-названий');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);
  const kws =
    Array.isArray(keywords) ? keywords.join(', ') : (keywords || 'не заданы');

  const system = `
Ты профессиональный SEO-специалист, который создаёт названия товаров для маркетплейса Ozon.
Всегда отвечай строго в формате JSON.
`;

  const user = [
    'Для КАЖДОГО товара придумай ТРИ разных SEO-названия для карточки на Ozon.',
    'Требования к каждому названию:',
    '- язык: русский;',
    '- длина: не более 120 символов;',
    '- название должно отражать суть товара и его преимущества;',
    '- избегай спама и прямых повторов;',
    '- не используй кавычки и лишние знаки препинания;',
    '- не добавляй номера вроде "(1)" или "- 1" внутрь названий.',
    '',
    `Ключевые слова: ${kws}.`,
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    '',
    'Данные товаров:',
    productsContext,
    '',
    'Верни ответ строго в JSON формате:',
    '{"descriptions":[{"index":0,"titles":["вариант1","вариант2","вариант3"]}, ...]}'
  ]
    .filter(Boolean)
    .join('\n');

  const content = await callGroqChat({
    system,
    user,
    temperature: 0.7,
    maxTokens: 900
  });

  const parsed = parseJsonFromModel(content);
  const descriptions = Array.isArray(parsed?.descriptions)
    ? parsed.descriptions
    : parsed;

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
 * Генерация SEO-описаний (аннотаций) для товаров
 * Возвращает: [{ index, text }]
 */
export async function generateSEODescription({ products, keywords, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации SEO-описаний');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);
  const kws =
    Array.isArray(keywords) ? keywords.join(', ') : (keywords || 'не заданы');

  const system = `
Ты SEO-копирайтер, создающий маркетинговые описания для карточек Ozon.
Отвечай строго JSON.
`;

  const user = [
    'Для КАЖДОГО товара создай одно SEO-описание (аннотацию) длиной примерно 500–800 символов.',
    'Задача описания:',
    '- коротко объяснить, что за товар;',
    '- показать, чем он полезен и кому подходит;',
    '- использовать ключевые слова органично;',
    '- избегать канцелярита и повторов;',
    '- не вставлять HTML и Markdown.',
    '',
    `Ключевые слова: ${kws}.`,
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    '',
    'Данные товаров:',
    productsContext,
    '',
    'Формат ответа STRICT JSON:',
    '{"descriptions":[{"index":0,"text":"...описание..."}, ...]}'
  ]
    .filter(Boolean)
    .join('\n');

  const content = await callGroqChat({
    system,
    user,
    temperature: 0.7,
    maxTokens: 2000
  });

  const parsed = parseJsonFromModel(content);
  const descriptions = Array.isArray(parsed?.descriptions)
    ? parsed.descriptions
    : parsed;

  if (!Array.isArray(descriptions)) {
    throw new Error('Ответ модели не содержит массива descriptions');
  }

  return descriptions.map((item) => ({
    index: item.index,
    text: String(item.text || '').trim()
  }));
}

/**
 * Генерация хештегов для Ozon (#Хештеги, атрибут 23171)
 * Возвращает: [{ index, hashtags: ["#пример", ...] }]
 */
export async function generateHashtags({ products, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации хештегов');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);

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
    '- не дублируй название бренда и точное название товара слишком часто;',
    '- избегай общего мусора типа #скидки #цена;',
    '- фокусируйся на назначении, типе товара, стиле, сценариях использования.',
    '',
    'Формат ответа STRICT JSON:',
    '{"hashtags":[{"index":0,"values":["#пример1","#пример2", ...]}, ...]}',
    '',
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    '',
    'Данные товаров:',
    productsContext
  ]
    .filter(Boolean)
    .join('\n');

  const content = await callGroqChat({
    system,
    user,
    temperature: 0.6,
    maxTokens: 1200
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

/**
 * Генерация Rich-контента JSON для атрибута 11254 ("Rich-контент JSON")
 * Возвращает: [{ index, content: {...richJson...} }]
 */
export async function generateRichJSON({ products, baseProductData }) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации Rich-контента');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);

  const system = `
Ты генерируешь Rich-контент JSON для Ozon (атрибут 11254).
Отвечай строго JSON, без пояснений.
`;

  const user = [
    'Для КАЖДОГО товара создай структуру Rich-контента в формате JSON.',
    'Упростим структуру до следующего вида:',
    '',
    '{',
    '  "rich": [',
    '    {',
    '      "index": 0,',
    '      "content": {',
    '        "blocks": [',
    '          { "type": "text", "text": "Краткое описание блока" },',
    '          { "type": "list", "title": "Преимущества", "items": ["пункт1","пункт2"] },',
    '          { "type": "text", "text": "Как использовать" }',
    '        ]',
    '      }',
    '    }',
    '  ]',
    '}',
    '',
    'Требования:',
    '- язык: русский;',
    '- никаких HTML-тегов;',
    '- не упоминай, что это JSON в самих текстах;',
    '- Rich-контент должен дополнять основное описание, а не дублировать его дословно.',
    '',
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    '',
    'Данные товаров:',
    productsContext,
    '',
    'Верни STRICT JSON ровно в указанном формате: {"rich":[...]}'
  ]
    .filter(Boolean)
    .join('\n');

  const content = await callGroqChat({
    system,
    user,
    temperature: 0.6,
    maxTokens: 2500
  });

  const parsed = parseJsonFromModel(content);
  const richArr = Array.isArray(parsed?.rich) ? parsed.rich : parsed;

  if (!Array.isArray(richArr)) {
    throw new Error('Ответ модели не содержит массива rich');
  }

  return richArr.map((item) => ({
    index: item.index,
    content: item.content || {}
  }));
}

/**
 * Генерация "слайдов" (структуры для слайдов/изображений) с опциональным водяным знаком
 * withWatermark: boolean — добавлять ли watermark
 * watermarkText: string — текст водяного знака (если withWatermark = true)
 *
 * Возвращает:
 * [
 *   {
 *     index,
 *     slides: [
 *       {
 *         title,
 *         subtitle,
 *         bullets: [],
 *         imageIdea,
 *         watermark: "Текст" | null
 *       },
 *       ...
 *     ]
 *   }
 * ]
 */
export async function generateSlides({
  products,
  baseProductData,
  withWatermark = false,
  watermarkText = ''
}) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Не переданы товары для генерации слайдов');
  }

  const baseInfo = describeObject(baseProductData);
  const productsContext = buildProductsContext(products);

  const watermarkInstruction = withWatermark
    ? `Для КАЖДОГО слайда заполняй поле "watermark" строкой "${watermarkText}".`
    : 'Для КАЖДОГО слайда заполняй поле "watermark" значением null.';

  const system = `
Ты помогаешь проектировать слайды и изображения для карточек товаров Ozon.
Каждый слайд описывается JSON-структурой. Отвечай строго JSON.
`;

  const user = [
    'Для КАЖДОГО товара создай от 3 до 6 слайдов.',
    'Каждый слайд описывается объектом с полями:',
    '{',
    '  "title": "краткий заголовок",',
    '  "subtitle": "дополнительное пояснение (может быть пустым)",',
    '  "bullets": ["краткий пункт 1","краткий пункт 2", ...],',
    '  "imageIdea": "что должно быть изображено на слайде",',
    '  "watermark": "текст или null"',
    '}',
    '',
    watermarkInstruction,
    '',
    'Формат ответа STRICT JSON:',
    '{',
    '  "slides": [',
    '    {',
    '      "index": 0,',
    '      "slides": [',
    '        { "title": "...", "subtitle": "...", "bullets": ["..."], "imageIdea": "...", "watermark": "..." },',
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
    '- imageIdea — одно-два предложения, что должно быть на картинке.',
    '',
    baseInfo && `Базовые параметры товара:\n${baseInfo}`,
    '',
    'Данные товаров:',
    productsContext
  ]
    .filter(Boolean)
    .join('\n');

  const content = await callGroqChat({
    system,
    user,
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

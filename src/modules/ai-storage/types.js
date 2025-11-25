// src/modules/ai-storage/types.js

// Основные категории AI-генераций.
// Расширяются без ломки структуры.
export const AiGenerationType = {
  SEO: "seo",             // SEO-name, SEO-description
  RICH: "rich",           // Ozon Rich JSON
  IMAGE: "image",         // картинки слайдов 3:4, обложки
  SLIDES: "slides",       // структура слайдов до генерации картинок
  META: "meta",           // hashtags и прочие метаданные
  TEXT: "text",           // любые текстовые блоки
  CUSTOM: "custom",       // резерв под новые типы
};

// Подтипы для конкретных сценариев Ozon.
// Это расширяемый словарь — можно добавлять свои варианты.
export const AiGenerationSubType = {
  // SEO
  SEO_NAME: "seo-name",
  SEO_DESCRIPTION: "seo-description",
  SEO_ANNOTATION: "seo-annotation",

  // Rich content
  OZON_RICH_JSON: "ozon-rich-json",

  // Slides
  SLIDES_STRUCTURE: "slides-structure",

  // Images
  IMAGE_3x4: "image-3x4",

  // Meta
  HASHTAGS: "hashtags",

  // Custom fallback
  CUSTOM_GENERIC: "custom-generic",
};

/**
 * @typedef {Object} AiGeneration
 * @property {string} id                Уникальный ID (timestamp или uuid)
 * @property {string} userId            Идентификатор пользователя (next-auth)
 * @property {string} type              Категория (из AiGenerationType)
 * @property {string} subType           Подтип (из AiGenerationSubType)
 * @property {string} [mode]            Логический режим вызова (seo-name, description, hashtags, rich, slides, custom и т.д.)
 * @property {string|null} [promptId]   Идентификатор промпта (если генерация запускалась по сохранённому шаблону)
 * @property {string} model             Название модели (groq-llama3, gpt-4o, flux-pro и т.д.)
 * @property {Object} input             Нормализованный вход (товар, атрибуты, категория)
 * @property {string} prompt            Финальный промпт, отправленный модели
 * @property {Object|string} output     Финальный результат модели (SEO текст, JSON, структура слайдов)
 * @property {string[]} images          Список URL изображений (может быть пустым)
 * @property {Object|string|null} [rawOutput] Сырой ответ модели (до парсинга), опционально
 * @property {string} createdAt         Время генерации ISOString
 */

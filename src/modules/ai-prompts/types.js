// src/modules/ai-prompts/types.js
//
// Базовые типы и константы для работы с AI‑промптами.
// Модуль не зависит от Next.js или конкретных AI‑провайдеров.

// Логические режимы использования промптов.
// Можно расширять при добавлении новых сценариев.
export const AiPromptMode = {
  SEO_NAME: 'seo-name',
  SEO_DESCRIPTION: 'description',
  HASHTAGS: 'hashtags',
  RICH: 'rich',
  SLIDES: 'slides',
  CUSTOM: 'custom'
};

/**
 * @typedef {Object} AiPrompt
 * @property {string} id                 Уникальный ID промпта
 * @property {string|null} userId        Владелец промпта (null = глобальный дефолт)
 * @property {string} mode               Логический режим (seo-name, description, hashtags, rich, slides, custom, ...)
 * @property {string} title              Краткое название промпта для UI
 * @property {string} [description]      Описание промпта / когда его использовать
 * @property {string} systemTemplate     Шаблон для system-сообщения
 * @property {string} userTemplate       Шаблон для user-сообщения
 * @property {Object|null} [variablesSchema]  Описание доступных переменных (может быть null)
 * @property {boolean} [isDefault]       Является ли промпт дефолтным для пары (userId, mode)
 * @property {string} createdAt          Время создания ISOString
 * @property {string} updatedAt          Время последнего обновления ISOString
 */


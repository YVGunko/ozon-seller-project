// src/modules/ai-prompts/index.js
//
// Публичное API модуля ai-prompts.
// Экспортирует типы, сервис и адаптеры, а также singleton‑фабрику.

export { AiPromptMode } from './types';
export { AiPromptsAdapter } from './promptsAdapter';
export { AiPromptsService } from './aiPromptsService';
export { BlobJsonPromptsAdapter } from './blobJsonPromptsAdapter';
export { getAiPrompts } from './serviceInstance';


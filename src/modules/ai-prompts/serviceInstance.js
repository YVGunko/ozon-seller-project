// src/modules/ai-prompts/serviceInstance.js
//
// Singleton‑экземпляр AiPromptsService для всего приложения.
// Сейчас использует BlobJsonPromptsAdapter (Vercel Blob JSON).

import { AiPromptsService } from './aiPromptsService';
import { BlobJsonPromptsAdapter } from './blobJsonPromptsAdapter';

let aiPromptsSingleton = null;

export function getAiPrompts() {
  if (!aiPromptsSingleton) {
    aiPromptsSingleton = new AiPromptsService(new BlobJsonPromptsAdapter());
  }
  return aiPromptsSingleton;
}


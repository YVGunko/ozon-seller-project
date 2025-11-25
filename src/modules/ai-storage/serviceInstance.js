// src/modules/ai-storage/serviceInstance.js
//
// Единый singleton‑экземпляр AiStorageService для всего приложения.
// Сейчас работает поверх BlobJsonAiStorageAdapter (Vercel Blob JSON),
// в будущем реализацию адаптера можно заменить, не меняя импортов.

import { AiStorageService } from './aiStorageService';
import { BlobJsonAiStorageAdapter } from './blobJsonAdapter';

let aiStorageSingleton = null;

/**
 * Вернуть единый экземпляр AiStorageService.
 *
 * Использование:
 *   import { getAiStorage } from '@/modules/ai-storage';
 *   const aiStorage = getAiStorage();
 */
export function getAiStorage() {
  if (!aiStorageSingleton) {
    aiStorageSingleton = new AiStorageService(new BlobJsonAiStorageAdapter());
  }
  return aiStorageSingleton;
}


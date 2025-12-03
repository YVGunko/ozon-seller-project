// src/modules/ai-storage/index.js
//
// Публичное API модуля ai-storage.
// Здесь экспортируются:
//   - базовые типы и сервисы;
//   - конкретные адаптеры хранилища;
//   - фабрика getAiStorage() для получения singleton‑сервиса.

export { AiStorageAdapter } from './storageAdapter';
export { AiStorageService } from './aiStorageService';
export { AiGenerationType, AiGenerationSubType } from './types';

// Адаптеры хранилищ
export { BlobJsonAiStorageAdapter } from './blobJsonAdapter';

// Singleton‑экземпляр сервиса поверх BlobJsonAiStorageAdapter
export { getAiStorage } from './serviceInstance';

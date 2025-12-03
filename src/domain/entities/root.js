// src/domain/entities/root.js
//
// Логическая вершина всей иерархии.
// На практике в системе, как правило, будет один Root,
// но модель допускает расширение.

/**
 * @typedef {Object} Root
 * @property {string} id          Уникальный идентификатор Root (обычно "root")
 * @property {string} name        Отображаемое имя
 * @property {string} createdAt   ISO‑время создания записи
 */

/**
 * Создать объект Root.
 * Пока используется как чистая структура данных без persistence‑логики.
 *
 * @param {Partial<Root>} [props]
 * @returns {Root}
 */
export function createRoot(props = {}) {
  const now = new Date().toISOString();
  return {
    id: props.id || 'root',
    name: props.name || 'Root',
    createdAt: props.createdAt || now
  };
}


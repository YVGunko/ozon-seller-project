// src/domain/entities/seller.js
//
// Seller — конкретный магазин / аккаунт маркетплейса,
// принадлежащий Enterprise. В текущем проекте это по сути
// то, что мы сейчас называем "профиль OZON" (clientId + apiKey),
// но модель расширяема под другие маркетплейсы.

/**
 * @typedef {Object} Seller
 * @property {string} id                  Внутренний ID Seller
 * @property {string} enterpriseId        ID Enterprise‑владельца
 * @property {string} marketplace         Код маркетплейса ("ozon", "wb", "ym" и т.п.)
 * @property {string} name                Человекочитаемое имя магазина / аккаунта
 * @property {Object} externalIds         Идентификаторы во внешних системах
 * @property {string} [externalIds.clientId]   Например, OZON client_id
 * @property {string} [externalIds.accountId]  Другой внешний ID, если требуется
 * @property {Object} [metadata]          Произвольная дополнительная инфа (URL, склад по умолчанию и пр.)
 * @property {string} createdAt           ISO‑время создания
 * @property {string} [updatedAt]         ISO‑время последнего обновления
 */

/**
 * Создать Seller на основе минимального набора данных.
 *
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.enterpriseId
 * @param {string} params.marketplace
 * @param {string} params.name
 * @param {Object} [params.externalIds]
 * @param {Object} [params.metadata]
 * @param {string} [params.createdAt]
 * @param {string} [params.updatedAt]
 * @returns {Seller}
 */
export function createSeller(params) {
  const now = new Date().toISOString();
  return {
    id: params.id,
    enterpriseId: params.enterpriseId,
    marketplace: params.marketplace,
    name: params.name,
    externalIds: params.externalIds || {},
    metadata: params.metadata || {},
    createdAt: params.createdAt || now,
    updatedAt: params.updatedAt || now
  };
}


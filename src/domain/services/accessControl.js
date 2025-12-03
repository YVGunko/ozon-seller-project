// src/domain/services/accessControl.js
//
// Централизованный контроль доступа на основе ролей пользователя.
// Здесь определяем "политики" доступа, а не в API/компонентах напрямую.

/**
 * @typedef {import('../entities/user').User} User
 */

const ROLE_ROOT_ADMIN = 'root_admin';
const ROLE_ADMIN_ALIAS = 'admin'; // совместимость с существующей ролью "admin"
const ROLE_MANAGER = 'manager';
const ROLE_CONTENT = 'content-creator';
const ROLE_FINANCE = 'finance';
const ROLE_ORDER = 'order';

function hasRole(user, role) {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.includes(role);
}

export function isRootAdmin(user) {
  return hasRole(user, ROLE_ROOT_ADMIN) || hasRole(user, ROLE_ADMIN_ALIAS);
}

export function canManageUsers(user) {
  return isRootAdmin(user) || hasRole(user, ROLE_MANAGER);
}

/**
 * Управление товарами (создание, обновление атрибутов, копирование).
 * Доступно:
 *  - root/admin;
 *  - manager;
 *  - content-creator.
 */
export function canManageProducts(user) {
  return (
    isRootAdmin(user) ||
    hasRole(user, ROLE_MANAGER) ||
    hasRole(user, ROLE_CONTENT)
  );
}

export function canUseAi(user) {
  return (
    isRootAdmin(user) ||
    hasRole(user, ROLE_MANAGER) ||
    hasRole(user, ROLE_CONTENT)
  );
}

export function canManagePrompts(user) {
  return (
    isRootAdmin(user) ||
    hasRole(user, ROLE_MANAGER) ||
    hasRole(user, ROLE_CONTENT)
  );
}

export function canManagePrices(user) {
  return (
    isRootAdmin(user) ||
    hasRole(user, ROLE_MANAGER) ||
    hasRole(user, ROLE_FINANCE)
  );
}

export function canManageOrders(user) {
  return (
    isRootAdmin(user) ||
    hasRole(user, ROLE_MANAGER) ||
    hasRole(user, ROLE_ORDER)
  );
}

/**
 * Просмотр технических логов (импорт / обновление атрибутов).
 * По умолчанию даём доступ:
 *  - root/admin;
 *  - manager;
 *  - finance (для контроля операций).
 */
export function canViewLogs(user) {
  return (
    isRootAdmin(user) ||
    hasRole(user, ROLE_MANAGER) ||
    hasRole(user, ROLE_FINANCE)
  );
}

// ────────────────────────────────────────────────────────────────────────────────
// AI‑доступ с учётом Enterprise‑настроек
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Нормализованные AI‑настройки Enterprise.
 * Пока минимально: включена ли текстовая / картинная генерация.
 *
 * @param {import('../entities/enterprise').Enterprise|null} enterprise
 */
export function getEnterpriseAiSettings(enterprise) {
  const ai = (enterprise && enterprise.settings && enterprise.settings.ai) || {};

  return {
    // По умолчанию всё включено; можно отключить, задав false.
    textEnabled: ai.textEnabled !== false,
    imageEnabled: ai.imageEnabled !== false,
    allowedTextModels: Array.isArray(ai.allowedTextModels)
      ? ai.allowedTextModels
      : null,
    allowedImageModels: Array.isArray(ai.allowedImageModels)
      ? ai.allowedImageModels
      : null
  };
}

/**
 * Можно ли пользователю использовать текстовые AI‑функции
 * (SEO‑названия, описания, хештеги, Rich‑контент, структура слайдов)
 * в рамках конкретного Enterprise.
 */
export function canUseAiText(user, enterprise) {
  if (!canUseAi(user)) return false;
  const settings = getEnterpriseAiSettings(enterprise);
  return settings.textEnabled;
}

/**
 * Можно ли пользователю использовать генерацию картинок (слайды и т.п.)
 * в рамках конкретного Enterprise.
 */
export function canUseAiImage(user, enterprise) {
  if (!canUseAi(user)) return false;
  const settings = getEnterpriseAiSettings(enterprise);
  return settings.imageEnabled;
}

// ────────────────────────────────────────────────────────────────────────────────
// Enterprise / Seller админка
// ────────────────────────────────────────────────────────────────────────────────

/**
 * Только root‑уровень (root_admin / admin) может создавать и редактировать Enterprise.
 */
export function canManageEnterprises(user) {
  return isRootAdmin(user);
}

/**
 * Управление Seller внутри Enterprise:
 *  - root‑админ может управлять любыми Seller;
 *  - manager может управлять Seller только в своём Enterprise.
 */
export function canManageSellers(user, enterprise) {
  if (!user || !enterprise) return false;
  if (isRootAdmin(user)) return true;
  return hasRole(user, ROLE_MANAGER) && user.enterpriseId === enterprise.id;
}

/**
 * Просмотр списка Enterprise:
 *  - root/admin видит все;
 *  - manager может видеть только свои Enterprise (фильтрация делается на уровне API).
 */
export function canViewEnterprises(user) {
  if (!user) return false;
  return isRootAdmin(user) || hasRole(user, ROLE_MANAGER);
}

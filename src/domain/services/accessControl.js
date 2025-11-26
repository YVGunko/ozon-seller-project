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

export function canUseAi(user) {
  return (
    isRootAdmin(user) ||
    hasRole(user, ROLE_MANAGER) ||
    hasRole(user, ROLE_CONTENT)
  );
}

export function canManagePrompts(user) {
  return isRootAdmin(user) || hasRole(user, ROLE_MANAGER);
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

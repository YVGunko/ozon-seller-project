// src/hooks/useAccess.js
//
// Клиентский хук, который даёт удобные флаги доступа
// на основе доменного пользователя и accessControl‑политик.

import { useCurrentContext } from './useCurrentContext';
import {
  isRootAdmin,
  canManageUsers,
  canManageProducts,
  canUseAi,
  canManagePrompts,
  canManagePrices,
  canManageOrders,
  canManageEnterprises,
  canViewLogs
} from '../domain/services/accessControl';

export function useAccess() {
  const { user } = useCurrentContext();

  return {
    user,
    isRootAdmin: isRootAdmin(user),
    canManageUsers: canManageUsers(user),
    canManageProducts: canManageProducts(user),
    canUseAi: canUseAi(user),
    canManagePrompts: canManagePrompts(user),
    canManagePrices: canManagePrices(user),
    canManageOrders: canManageOrders(user),
    canManageEnterprises: canManageEnterprises(user),
    canViewLogs: canViewLogs(user)
  };
}

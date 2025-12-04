// src/utils/userScopedStorage.js
//
// Хелпер для очистки всех user‑scoped данных в localStorage при выходе пользователя.
// Очищает:
//   - текущий профиль (ProfileManager / currentProfileMeta);
//   - выбранный склад (currentWarehouse);
//   - кеш списков складов (warehousesCache).

import { ProfileManager } from './profileManager';
import { WarehouseManager } from './warehouseManager';

export function clearUserScopedStorage() {
  if (typeof window === 'undefined') return;

  try {
    ProfileManager.clearProfile();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[userScopedStorage] failed to clear profile', error);
  }

  try {
    WarehouseManager.clearCurrentWarehouse();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[userScopedStorage] failed to clear currentWarehouse', error);
  }

  try {
    WarehouseManager.clearAllWarehouses();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[userScopedStorage] failed to clear warehousesCache', error);
  }
}


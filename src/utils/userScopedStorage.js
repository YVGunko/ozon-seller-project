// src/utils/userScopedStorage.js
//
// Хелпер для очистки всех user‑scoped данных в localStorage при выходе пользователя.
// Очищает:
//   - текущий профиль (ProfileManager / currentProfileMeta);
//   - выбранный склад (currentWarehouse);
//   - кеш списков складов (warehousesCache).

import { ProfileManager } from './profileManager';

const WAREHOUSE_STORAGE_KEY = 'currentWarehouse';
const WAREHOUSES_CACHE_KEY = 'warehousesCache';

export function clearUserScopedStorage() {
  if (typeof window === 'undefined') return;

  try {
    ProfileManager.clearProfile();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[userScopedStorage] failed to clear profile', error);
  }

  try {
    window.localStorage.removeItem(WAREHOUSE_STORAGE_KEY);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[userScopedStorage] failed to clear currentWarehouse', error);
  }

  try {
    window.localStorage.removeItem(WAREHOUSES_CACHE_KEY);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[userScopedStorage] failed to clear warehousesCache', error);
  }
}


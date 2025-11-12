const STORAGE_KEY = 'currentWarehouse';

const getProfileKey = (profile) => {
  if (!profile || typeof profile !== 'object') return null;
  if (profile.profileKey) return profile.profileKey;
  if (profile.ozon_client_id) return String(profile.ozon_client_id);
  if (profile.clientId) return String(profile.clientId);
  return null;
};

export const WarehouseStatusMap = {
  new: 'Активируется',
  created: 'Активный',
  disabled: 'В архиве',
  blocked: 'Заблокирован',
  disabled_due_to_limit: 'На паузе',
  error: 'Ошибка'
};

export const WarehouseManager = {
  getStoredWarehouse() {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('WarehouseManager.getStoredWarehouse error', error);
      return null;
    }
  },

  getCurrentWarehouse(profile = null) {
    const stored = this.getStoredWarehouse();
    if (!stored) return null;
    const profileKey = getProfileKey(profile);
    if (profileKey && stored.profileKey && stored.profileKey !== profileKey) {
      return null;
    }
    return stored;
  },

  setCurrentWarehouse(warehouse, profile = null) {
    if (typeof window === 'undefined') return;
    if (!warehouse || !warehouse.warehouse_id) {
      this.clearCurrentWarehouse();
      return;
    }
    try {
      const payload = {
        warehouse_id: warehouse.warehouse_id,
        name: warehouse.name || '',
        status: warehouse.status || '',
        profileKey: getProfileKey(profile)
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error('WarehouseManager.setCurrentWarehouse error', error);
    }
  },

  clearCurrentWarehouse() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('WarehouseManager.clearCurrentWarehouse error', error);
    }
  }
};

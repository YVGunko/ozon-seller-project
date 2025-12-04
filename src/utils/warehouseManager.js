const STORAGE_KEY = 'currentWarehouse';
const WAREHOUSES_STORAGE_KEY = 'warehousesCache';

const getProfileKey = (profile) => {
  if (!profile || typeof profile !== 'object') return null;
  if (profile.profileKey) return profile.profileKey;
  if (profile.id) return String(profile.id);
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

let warehousesCache = null;

const loadWarehousesCache = () => {
  if (typeof window === 'undefined') return;
  if (warehousesCache !== null) return;
  try {
    const raw = window.localStorage.getItem(WAREHOUSES_STORAGE_KEY);
    if (!raw) {
      warehousesCache = {};
      return;
    }
    const parsed = JSON.parse(raw);
    warehousesCache =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.error('WarehouseManager.loadWarehousesCache error', error);
    warehousesCache = {};
  }
};

const saveWarehousesCache = () => {
  if (typeof window === 'undefined') return;
  if (!warehousesCache) {
    warehousesCache = {};
  }
  try {
    window.localStorage.setItem(WAREHOUSES_STORAGE_KEY, JSON.stringify(warehousesCache));
  } catch (error) {
    console.error('WarehouseManager.saveWarehousesCache error', error);
  }
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
  },

  getWarehouses(profile = null) {
    if (typeof window === 'undefined') return null;
    const profileKey = getProfileKey(profile);
    if (!profileKey) return null;

    if (warehousesCache === null) {
      loadWarehousesCache();
    }
    const entry = warehousesCache && warehousesCache[profileKey];
    if (!entry || !Array.isArray(entry.warehouses)) return null;
    return entry.warehouses;
  },

  setWarehouses(profile = null, warehouses = []) {
    if (typeof window === 'undefined') return;
    const profileKey = getProfileKey(profile);
    if (!profileKey || !Array.isArray(warehouses)) return;

    if (warehousesCache === null) {
      loadWarehousesCache();
    }
    warehousesCache[profileKey] = {
      warehouses,
      updatedAt: Date.now()
    };
    saveWarehousesCache();
  },

  clearWarehouses(profile = null) {
    if (typeof window === 'undefined') return;
    const profileKey = getProfileKey(profile);
    if (!profileKey) return;
    if (warehousesCache === null) {
      loadWarehousesCache();
    }
    if (warehousesCache[profileKey]) {
      delete warehousesCache[profileKey];
      saveWarehousesCache();
    }
  },

  clearAllWarehouses() {
    if (typeof window === 'undefined') return;
    warehousesCache = {};
    try {
      window.localStorage.removeItem(WAREHOUSES_STORAGE_KEY);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('WarehouseManager.clearAllWarehouses error', error);
    }
  }
};

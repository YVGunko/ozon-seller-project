import { useState, useEffect, useCallback, useRef } from 'react';
import { WarehouseManager, WarehouseStatusMap } from '../utils/warehouseManager';

const buildProfileQuery = (profile) => {
  if (!profile || !profile.id) return '';
  return String(profile.id);
};

const getStatusLabel = (status) => {
  if (!status) return '';
  return WarehouseStatusMap[status] || status;
};

export const useWarehouses = (profile) => {
  const [warehouses, setWarehouses] = useState(() => {
    const cached = WarehouseManager.getWarehouses(profile);
    return Array.isArray(cached) ? cached : [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const lastLoadedProfileIdRef = useRef(null);

  const selectWarehouse = useCallback(
    (warehouseId) => {
      if (!warehouseId) {
        setSelectedWarehouse(null);
        WarehouseManager.clearCurrentWarehouse();
        return;
      }
      const found = warehouses.find(
        (warehouse) => String(warehouse.warehouse_id) === String(warehouseId)
      );
      if (!found) return;
      setSelectedWarehouse(found);
      WarehouseManager.setCurrentWarehouse(found, profile);
    },
    [warehouses, profile]
  );

  const fetchWarehouses = useCallback(
    async (options = {}) => {
      const { force = false } = options;
      const profileId = profile?.id ? String(profile.id) : null;

      if (!profileId) {
        lastLoadedProfileIdRef.current = null;
        setWarehouses([]);
        setSelectedWarehouse(null);
        setError('');
        return;
      }

      // Попытка использовать кеш из WarehouseManager (in-memory + localStorage),
      // если не запрашивали принудительное обновление.
      if (!force) {
        const cachedList = WarehouseManager.getWarehouses(profile);
        if (Array.isArray(cachedList) && cachedList.length > 0) {
          setWarehouses(cachedList);
          const stored = WarehouseManager.getCurrentWarehouse(profile);
          if (stored) {
            const match = cachedList.find(
              (warehouse) =>
                String(warehouse.warehouse_id) === String(stored.warehouse_id)
            );
            if (match) {
              setSelectedWarehouse(match);
            }
          }
          lastLoadedProfileIdRef.current = profileId;
          return;
        }
      }

      setLoading(true);
      setError('');
      try {
        const profileQuery = buildProfileQuery(profile);
        const query = profileQuery ? `?profileId=${encodeURIComponent(profileQuery)}` : '';
        const response = await fetch(`/api/warehouses${query}`);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Не удалось загрузить склады');
        }
        const data = await response.json();
        const list = Array.isArray(data?.result)
          ? data.result.map((warehouse) => ({
              ...warehouse,
              status_label: getStatusLabel(warehouse?.status)
            }))
          : [];
        setWarehouses(list);
        WarehouseManager.setWarehouses(profile, list);

        const stored = WarehouseManager.getCurrentWarehouse(profile);
        if (stored) {
          const match = list.find(
            (warehouse) => String(warehouse.warehouse_id) === String(stored.warehouse_id)
          );
          if (match) {
            setSelectedWarehouse(match);
            lastLoadedProfileIdRef.current = profileId;
            return;
          }
        }

        if (list.length > 0) {
          const preferred =
            list.find((warehouse) => warehouse.status === 'created') || list[0];
          setSelectedWarehouse(preferred);
          WarehouseManager.setCurrentWarehouse(preferred, profile);
        } else {
          setSelectedWarehouse(null);
          WarehouseManager.clearCurrentWarehouse();
        }

        lastLoadedProfileIdRef.current = profileId;
      } catch (fetchError) {
        console.error('Failed to fetch warehouses', fetchError);
        setError(fetchError.message || 'Не удалось загрузить склады');
      } finally {
        setLoading(false);
      }
    },
    [profile, warehouses.length]
  );

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  return {
    warehouses,
    loading,
    error,
    selectedWarehouse,
    refreshWarehouses: fetchWarehouses,
    selectWarehouse
  };
};

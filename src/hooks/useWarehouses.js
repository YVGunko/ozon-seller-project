import { useState, useEffect, useCallback } from 'react';
import { WarehouseManager, WarehouseStatusMap } from '../utils/warehouseManager';

const buildProfileQuery = (profile) => {
  if (!profile) return '';
  return encodeURIComponent(JSON.stringify(profile));
};

const getStatusLabel = (status) => {
  if (!status) return '';
  return WarehouseStatusMap[status] || status;
};

export const useWarehouses = (profile) => {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);

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

  const fetchWarehouses = useCallback(async () => {
    if (!profile) {
      setWarehouses([]);
      setSelectedWarehouse(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const profileQuery = buildProfileQuery(profile);
      const query = profileQuery ? `?profile=${profileQuery}` : '';
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

      const stored = WarehouseManager.getCurrentWarehouse(profile);
      if (stored) {
        const match = list.find(
          (warehouse) => String(warehouse.warehouse_id) === String(stored.warehouse_id)
        );
        if (match) {
          setSelectedWarehouse(match);
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
    } catch (fetchError) {
      console.error('Failed to fetch warehouses', fetchError);
      setError(fetchError.message || 'Не удалось загрузить склады');
    } finally {
      setLoading(false);
    }
  }, [profile]);

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

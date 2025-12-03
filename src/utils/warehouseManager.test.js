import { WarehouseManager } from './warehouseManager';

function createMockWindow() {
  const store = {};
  return {
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      setItem(key, value) {
        store[key] = String(value);
      },
      removeItem(key) {
        delete store[key];
      }
    }
  };
}

describe('WarehouseManager', () => {
  beforeEach(() => {
    // @ts-ignore
    global.window = createMockWindow();
  });

  test('setCurrentWarehouse / getCurrentWarehouse сохраняет и читает склад с привязкой к профилю', () => {
    const profile = { id: 'p1' };
    const warehouse = { warehouse_id: 10, name: 'Main', status: 'created' };

    WarehouseManager.setCurrentWarehouse(warehouse, profile);

    const current = WarehouseManager.getCurrentWarehouse(profile);
    expect(current).not.toBeNull();
    expect(current.warehouse_id).toBe(10);
    expect(current.profileKey).toBe('p1');

    // Для другого профиля склад не должен подходить
    const other = WarehouseManager.getCurrentWarehouse({ id: 'p2' });
    expect(other).toBeNull();
  });

  test('setWarehouses / getWarehouses кеширует список складов по профилю', () => {
    const profile = { id: 'p-profile' };
    const warehouses = [
      { warehouse_id: 1, name: 'A', status: 'created' },
      { warehouse_id: 2, name: 'B', status: 'disabled' }
    ];

    WarehouseManager.setWarehouses(profile, warehouses);

    const cached = WarehouseManager.getWarehouses(profile);
    expect(Array.isArray(cached)).toBe(true);
    expect(cached).toHaveLength(2);
    expect(cached[0].warehouse_id).toBe(1);
    expect(cached[1].name).toBe('B');
  });

  test('clearWarehouses удаляет кеш только для указанного профиля', () => {
    const profile1 = { id: 'p1' };
    const profile2 = { id: 'p2' };

    WarehouseManager.setWarehouses(profile1, [{ warehouse_id: 1 }]);
    WarehouseManager.setWarehouses(profile2, [{ warehouse_id: 2 }]);

    expect(WarehouseManager.getWarehouses(profile1)).not.toBeNull();
    expect(WarehouseManager.getWarehouses(profile2)).not.toBeNull();

    WarehouseManager.clearWarehouses(profile1);

    expect(WarehouseManager.getWarehouses(profile1)).toBeNull();
    expect(WarehouseManager.getWarehouses(profile2)).not.toBeNull();
  });
});

import {
  isRootAdmin,
  canManageUsers,
  canUseAi,
  canManagePrompts,
  canManagePrices,
  canManageOrders,
  canUseAiText,
  canUseAiImage,
  getEnterpriseAiSettings,
  canManageEnterprises,
  canManageSellers,
  canViewEnterprises
} from './accessControl';

const makeUser = (roles) => ({
  id: 'u1',
  enterpriseId: 'ent-1',
  email: 'user@example.com',
  roles,
  sellerIds: [],
  preferences: {},
  createdAt: new Date().toISOString()
});

describe('accessControl', () => {
  test('root_admin has access to everything', () => {
    const user = makeUser(['root_admin']);
    expect(isRootAdmin(user)).toBe(true);
    expect(canManageUsers(user)).toBe(true);
    expect(canUseAi(user)).toBe(true);
    expect(canManagePrompts(user)).toBe(true);
    expect(canManagePrices(user)).toBe(true);
    expect(canManageOrders(user)).toBe(true);
  });

  test('manager capabilities', () => {
    const user = makeUser(['manager']);
    expect(isRootAdmin(user)).toBe(false);
    expect(canManageUsers(user)).toBe(true);
    expect(canUseAi(user)).toBe(true);
    expect(canManagePrompts(user)).toBe(true);
    expect(canManagePrices(user)).toBe(true);
    expect(canManageOrders(user)).toBe(true);
  });

  test('content-creator capabilities', () => {
    const user = makeUser(['content-creator']);
    expect(canUseAi(user)).toBe(true);
    expect(canManageUsers(user)).toBe(false);
    // Контент-роль может управлять AI‑промптами
    expect(canManagePrompts(user)).toBe(true);
    expect(canManagePrices(user)).toBe(false);
    expect(canManageOrders(user)).toBe(false);
  });

  test('finance capabilities', () => {
    const user = makeUser(['finance']);
    expect(canManagePrices(user)).toBe(true);
    expect(canUseAi(user)).toBe(false);
    expect(canManageUsers(user)).toBe(false);
    expect(canManagePrompts(user)).toBe(false);
    expect(canManageOrders(user)).toBe(false);
  });

  test('order capabilities', () => {
    const user = makeUser(['order']);
    expect(canManageOrders(user)).toBe(true);
    expect(canUseAi(user)).toBe(false);
    expect(canManageUsers(user)).toBe(false);
    expect(canManagePrompts(user)).toBe(false);
    expect(canManagePrices(user)).toBe(false);
  });

  test('canManageEnterprises only for root/admin', () => {
    const root = makeUser(['root_admin']);
    const adminAlias = makeUser(['admin']);
    const manager = makeUser(['manager']);
    expect(canManageEnterprises(root)).toBe(true);
    expect(canManageEnterprises(adminAlias)).toBe(true);
    expect(canManageEnterprises(manager)).toBe(false);
  });

  test('canViewEnterprises for root/admin and manager', () => {
    const root = makeUser(['root_admin']);
    const adminAlias = makeUser(['admin']);
    const manager = makeUser(['manager']);
    const content = makeUser(['content-creator']);
    expect(canViewEnterprises(root)).toBe(true);
    expect(canViewEnterprises(adminAlias)).toBe(true);
    expect(canViewEnterprises(manager)).toBe(true);
    expect(canViewEnterprises(content)).toBe(false);
  });

  test('canManageSellers for root and managers within same enterprise', () => {
    const enterprise = { id: 'ent-1', settings: {} };
    const root = makeUser(['root_admin']);
    const managerSameEnt = makeUser(['manager']);
    managerSameEnt.enterpriseId = 'ent-1';
    const managerOtherEnt = makeUser(['manager']);
    managerOtherEnt.enterpriseId = 'ent-2';
    const content = makeUser(['content-creator']);

    expect(canManageSellers(root, enterprise)).toBe(true);
    expect(canManageSellers(managerSameEnt, enterprise)).toBe(true);
    expect(canManageSellers(managerOtherEnt, enterprise)).toBe(false);
    expect(canManageSellers(content, enterprise)).toBe(false);
    expect(canManageSellers(managerSameEnt, null)).toBe(false);
  });

  test('enterprise AI settings defaults and overrides', () => {
    const enterpriseNull = null;
    const defaults = getEnterpriseAiSettings(enterpriseNull);
    expect(defaults.textEnabled).toBe(true);
    expect(defaults.imageEnabled).toBe(true);

    const enterpriseDisabled = {
      id: 'ent-1',
      settings: {
        ai: {
          textEnabled: false,
          imageEnabled: true
        }
      }
    };
    const s2 = getEnterpriseAiSettings(enterpriseDisabled);
    expect(s2.textEnabled).toBe(false);
    expect(s2.imageEnabled).toBe(true);
  });

  test('canUseAiText / canUseAiImage respect roles and enterprise settings', () => {
    const manager = makeUser(['manager']);
    const finance = makeUser(['finance']);

    const enterpriseAllOn = {
      id: 'ent-1',
      settings: { ai: {} }
    };
    const enterpriseTextOff = {
      id: 'ent-1',
      settings: {
        ai: {
          textEnabled: false,
          imageEnabled: true
        }
      }
    };

    // Менеджер с включённым AI
    expect(canUseAiText(manager, enterpriseAllOn)).toBe(true);
    expect(canUseAiImage(manager, enterpriseAllOn)).toBe(true);

    // Финансист не имеет AI‑прав вне зависимости от настроек Enterprise
    expect(canUseAiText(finance, enterpriseAllOn)).toBe(false);
    expect(canUseAiImage(finance, enterpriseAllOn)).toBe(false);

    // Отключаем текстовый AI на уровне Enterprise
    expect(canUseAiText(manager, enterpriseTextOff)).toBe(false);
    expect(canUseAiImage(manager, enterpriseTextOff)).toBe(true);
  });
});

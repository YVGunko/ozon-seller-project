import {
  isRootAdmin,
  canManageUsers,
  canUseAi,
  canManagePrompts,
  canManagePrices,
  canManageOrders
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
    expect(canManagePrompts(user)).toBe(false);
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
});


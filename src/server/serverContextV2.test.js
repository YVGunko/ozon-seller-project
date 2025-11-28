// src/server/serverContextV2.test.js

import { serverContextV2 } from './serverContextV2';
import { getAuthContext } from './authContext';
import { ensureAuth } from './ensureAuth';
import { configStorage } from '../services/configStorage';
import { DomainResolver } from '../domain/services/domainResolver';

// ---- Моки ----

// мягкая авторизация
jest.mock('./authContext', () => ({
  getAuthContext: jest.fn()
}));

// жёсткая авторизация
jest.mock('./ensureAuth', () => ({
  ensureAuth: jest.fn()
}));

// хранилище
jest.mock('../services/configStorage', () => ({
  configStorage: {
    getUsers: jest.fn(),
    getEnterprises: jest.fn(),
    getSellers: jest.fn()
  }
}));

// DomainResolver мок
jest.mock('../domain/services/domainResolver', () => {
  return {
    DomainResolver: jest.fn().mockImplementation(() => {
      return {
        resolve: jest.fn(async (user, opts) => ({
          user,
          enterprises: [{ id: 'ent1' }],
          sellers: [{ id: 'sel1' }],
          activeEnterprise: { id: 'ent1' },
          activeSellerIds: ['sel1'],
          _passedOptions: opts
        }))
      };
    })
  };
});

describe('serverContextV2', () => {
  const mockReq = {};
  const mockRes = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------
  // requireAuth === true → должен вызывать ensureAuth
  // ---------------------------------------------------------
  test('requireAuth=true вызывает ensureAuth и возвращает контекст', async () => {
    ensureAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: 'u1', email: 'u1@example.com' }
    });

    const ctx = await serverContextV2(mockReq, mockRes, {
      requireAuth: true
    });

    expect(ensureAuth).toHaveBeenCalledTimes(1);
    expect(getAuthContext).not.toHaveBeenCalled();

    expect(ctx.auth.user.id).toBe('u1');
    expect(ctx.domain.activeEnterprise.id).toBe('ent1');
    expect(ctx.domain.activeSellerIds).toEqual(['sel1']);
  });

  test('requireAuth=true → ensureAuth бросает ошибку', async () => {
    const err = Object.assign(new Error('Unauthorized'), {
      statusCode: 401
    });

    ensureAuth.mockRejectedValue(err);

    await expect(
      serverContextV2(mockReq, mockRes, { requireAuth: true })
    ).rejects.toThrow('Unauthorized');

    expect(ensureAuth).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------
  // requireAuth === false → мягкая авторизация через getAuthContext
  // ---------------------------------------------------------
  test('requireAuth=false вызывает getAuthContext', async () => {
    getAuthContext.mockResolvedValue({
      isAuthenticated: false,
      user: null
    });

    const ctx = await serverContextV2(mockReq, mockRes, {
      requireAuth: false
    });

    expect(getAuthContext).toHaveBeenCalledTimes(1);
    expect(ensureAuth).not.toHaveBeenCalled();

    // user=null → DomainResolver.resolve(null)
    expect(ctx.domain.user).toBeNull();
  });

  // ---------------------------------------------------------
  // DomainResolver должен получать корректные параметры
  // ---------------------------------------------------------
  test('DomainResolver получает activeEnterpriseId / activeSellerId / activeSellerIds', async () => {
    ensureAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: 'u1' }
    });

    const ctx = await serverContextV2(mockReq, mockRes, {
      requireAuth: true,
      activeEnterpriseId: 'ent55',
      activeSellerId: 'sel99',
      activeSellerIds: ['selA', 'selB']
    });

    expect(ctx.domain._passedOptions).toEqual({
      activeEnterpriseId: 'ent55',
      activeSellerId: 'sel99',
      activeSellerIds: ['selA', 'selB']
    });
  });

  // ---------------------------------------------------------
  // Контекст должен содержать auth/domain/storage/resolver
  // ---------------------------------------------------------
  test('возвращает структуру контекста', async () => {
    ensureAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: 'u1' }
    });

    const ctx = await serverContextV2(mockReq, mockRes);

    expect(ctx).toHaveProperty('auth');
    expect(ctx).toHaveProperty('domain');
    expect(ctx).toHaveProperty('storage');
    expect(ctx).toHaveProperty('resolver');

    expect(ctx.storage).toBe(configStorage);
    expect(typeof ctx.resolver.resolve).toBe('function');
  });

  // ---------------------------------------------------------
  // В мягком режиме user=null → DomainResolver всё равно работает
  // ---------------------------------------------------------
  test('мягкий режим: user=null корректно передаётся в domain.resolve', async () => {
    getAuthContext.mockResolvedValue({
      isAuthenticated: false,
      user: null
    });

    const ctx = await serverContextV2(mockReq, mockRes, {
      requireAuth: false
    });

    expect(ctx.domain.user).toBeNull();
    expect(ctx.domain.activeEnterprise.id).toBe('ent1');
    expect(ctx.domain.activeSellerIds).toEqual(['sel1']);
  });
});

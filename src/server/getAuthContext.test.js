// src/server/getAuthContext.test.js

import { getAuthContext } from './authContext';
import { getServerSession } from 'next-auth/next';
import { configStorage } from '../services/configStorage';

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn()
}));

jest.mock('../services/configStorage', () => ({
  configStorage: {
    getUsers: jest.fn()
  }
}));

const mockReq = {};
const mockRes = {};

describe('getAuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('возвращает isAuthenticated=false, если нет сессии', async () => {
    getServerSession.mockResolvedValue(null);

    const ctx = await getAuthContext(mockReq, mockRes);

    expect(ctx.isAuthenticated).toBe(false);
    expect(ctx.user).toBeNull();
  });

  test('возвращает пользователя, если сессия существует', async () => {
    getServerSession.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'user@ex.com',
        username: 'user',
        name: 'User Name',
        roles: ['seller'],
        allowedProfiles: ['3497256'],
        enterpriseIds: ['ent-1'],
        enterpriseId: 'ent-1'
      }
    });

    configStorage.getUsers.mockResolvedValue([]);

    const ctx = await getAuthContext(mockReq, mockRes);

    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.user.id).toBe('u1');
    expect(ctx.user.email).toBe('user@ex.com');
    expect(ctx.user.roles).toEqual(['seller']);
    expect(ctx.user.allowedProfiles).toEqual(['3497256']);
    expect(ctx.user.enterpriseIds).toEqual(['ent-1']);
    expect(ctx.user.enterpriseId).toBe('ent-1');
  });

  test('корректно нормализует некорректные roles (не массив)', async () => {
    getServerSession.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'user@ex.com',
        roles: 'wrong_value'
      }
    });

    const ctx = await getAuthContext(mockReq, mockRes);

    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.user.roles).toEqual([]); // пустой массив
  });

  test('переопределяет allowedProfiles и enterprises из configStorage, если есть запись пользователя', async () => {
    getServerSession.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'user@ex.com',
        username: 'user',
        name: 'User Name',
        roles: ['seller'],
        allowedProfiles: ['old1'],
        enterpriseIds: ['old-ent'],
        enterpriseId: 'old-ent'
      }
    });

    configStorage.getUsers.mockResolvedValue([
      {
        id: 'u1',
        username: 'user',
        profiles: ['p1', 'p2'],
        enterprises: ['ent-1', 'ent-2'],
        enterpriseId: 'ent-2'
      }
    ]);

    const ctx = await getAuthContext(mockReq, mockRes);

    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.user.allowedProfiles).toEqual(['p1', 'p2']);
    expect(ctx.user.enterpriseIds).toEqual(['ent-1', 'ent-2']);
    expect(ctx.user.enterpriseId).toBe('ent-2');
  });

  test('в случае ошибки возвращает isAuthenticated=false', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    getServerSession.mockRejectedValue(new Error('Internal Error'));

    const ctx = await getAuthContext(mockReq, mockRes);

    expect(ctx.isAuthenticated).toBe(false);
    expect(ctx.user).toBeNull();

    consoleSpy.mockRestore();
  });
});

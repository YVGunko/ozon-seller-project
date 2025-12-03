// src/server/getAuthContext.test.js

import { getAuthContext } from './authContext';
import { getServerSession } from 'next-auth/next';

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn()
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

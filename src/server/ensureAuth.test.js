// src/server/ensureAuth.test.js

import { ensureAuth } from './ensureAuth';
import { getAuthContext } from './authContext';

jest.mock('./authContext', () => ({
  getAuthContext: jest.fn()
}));

describe('ensureAuth', () => {
  const mockReq = {};
  const mockRes = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('возвращает контекст, если пользователь авторизован', async () => {
    getAuthContext.mockResolvedValue({
      isAuthenticated: true,
      user: { id: 'u1', email: 'u1@example.com' }
    });

    const ctx = await ensureAuth(mockReq, mockRes);

    expect(ctx.isAuthenticated).toBe(true);
    expect(ctx.user.id).toBe('u1');
  });

  test('бросает ошибку 401, если пользователь не авторизован', async () => {
    getAuthContext.mockResolvedValue({
      isAuthenticated: false,
      user: null
    });

    await expect(ensureAuth(mockReq, mockRes)).rejects.toThrow('Unauthorized');

    try {
      await ensureAuth(mockReq, mockRes);
    } catch (e) {
      expect(e.statusCode).toBe(401);
    }
  });

  test('бросает ошибку 401, если getAuthContext возвращает ошибку', async () => {
    getAuthContext.mockRejectedValue(new Error('Internal failure'));

    await expect(ensureAuth(mockReq, mockRes)).rejects.toThrow('Unauthorized');
  });
});


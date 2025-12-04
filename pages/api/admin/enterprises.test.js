// pages/api/admin/enterprises.test.js
// Тесты для /api/admin/enterprises (GET/POST/PATCH), работающих через Redis configStorage

// Мокаем withServerContext так, чтобы прокидывать ctx из req._ctx
jest.mock('../../../src/server/apiUtils', () => {
  return {
    withServerContext: (handler /*, options */) => {
      return async (req, res) => {
        const ctx = req._ctx || { auth: { user: null } };
        return handler(req, res, ctx);
      };
    }
  };
});

// Мокаем accessControl, будем управлять значениями в тестах
jest.mock('../../../src/domain/services/accessControl', () => ({
  canViewEnterprises: jest.fn(() => true),
  canManageEnterprises: jest.fn(() => true)
}));

// Мокаем enterpriseStore.reloadEnterprisesFromBlob, чтобы не было побочных эффектов
jest.mock('../../../src/server/enterpriseStore', () => ({
  reloadEnterprisesFromBlob: jest.fn(async () => undefined)
}));

// Мокаем configStorage (Redis слой)
jest.mock('../../../src/services/configStorage', () => ({
  configStorage: {
    getEnterprises: jest.fn(),
    saveEnterprises: jest.fn()
  }
}));

const { canViewEnterprises, canManageEnterprises } = require('../../../src/domain/services/accessControl');
const { configStorage } = require('../../../src/services/configStorage');

// Импортируем тестируемый handler (экспорт по умолчанию)
const handler = require('./enterprises').default;

function makeRes() {
  const res = {
    _status: 200,
    _json: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(payload) {
      this._json = payload;
      return this;
    },
    get statusCode() {
      return this._status;
    },
    get body() {
      return this._json;
    },
    headersSent: false
  };
  return res;
}

describe('/api/admin/enterprises', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET (admin): возвращает все enterprises из Redis', async () => {
    canViewEnterprises.mockReturnValue(true);
    canManageEnterprises.mockReturnValue(true);

    const enterprises = [
      { id: 'ent1', name: 'E1', slug: 'e1', settings: {} },
      { id: 'ent2', name: 'E2', slug: 'e2', settings: {} }
    ];
    configStorage.getEnterprises.mockResolvedValue(enterprises);

    const req = { method: 'GET', _ctx: { auth: { user: { id: 'u1', allowedProfiles: [] } } } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      items: [
        { id: 'ent1', name: 'E1', slug: 'e1', settings: {} },
        { id: 'ent2', name: 'E2', slug: 'e2', settings: {} }
      ]
    });
    expect(configStorage.getEnterprises).toHaveBeenCalledTimes(1);
  });

  test('GET (manager): фильтрует enterprises по user.enterprises', async () => {
    canViewEnterprises.mockReturnValue(true);
    canManageEnterprises.mockReturnValue(false);

    const enterprises = [
      { id: 'ent1', name: 'E1', slug: 'e1', settings: {} },
      { id: 'ent2', name: 'E2', slug: 'e2', settings: {} },
      { id: 'ent3', name: 'E3', slug: 'e3', settings: {} }
    ];
    configStorage.getEnterprises.mockResolvedValue(enterprises);

    const req = {
      method: 'GET',
      _ctx: { auth: { user: { id: 'u2', enterprises: ['ent1'] } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      items: [
        { id: 'ent1', name: 'E1', slug: 'e1', settings: {} }
      ]
    });
  });

  test('POST (admin): создаёт новый Enterprise в Redis', async () => {
    canManageEnterprises.mockReturnValue(true);
    configStorage.getEnterprises.mockResolvedValue([]);
    configStorage.saveEnterprises.mockResolvedValue(undefined);

    const req = {
      method: 'POST',
      body: { name: 'Acme', slug: 'acme', settings: { ai: { textEnabled: true } } },
      _ctx: { auth: { user: { id: 'admin' } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('enterprise');
    expect(res.body.enterprise).toMatchObject({
      name: 'Acme',
      slug: 'acme',
      settings: { ai: { textEnabled: true } }
    });
    // Должна быть запись в Redis с одним элементом
    expect(configStorage.saveEnterprises).toHaveBeenCalledTimes(1);
    const savedArg = configStorage.saveEnterprises.mock.calls[0][0];
    expect(Array.isArray(savedArg)).toBe(true);
    expect(savedArg.length).toBe(1);
    expect(savedArg[0].name).toBe('Acme');
  });

  test('POST: конфликт по slug → 409', async () => {
    canManageEnterprises.mockReturnValue(true);
    configStorage.getEnterprises.mockResolvedValue([
      { id: 'ent1', name: 'E1', slug: 'acme', settings: {} }
    ]);

    const req = {
      method: 'POST',
      body: { name: 'Acme 2', slug: 'acme' },
      _ctx: { auth: { user: { id: 'admin' } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Enterprise с таким slug уже существует' });
  });

  test('PATCH: обновляет name', async () => {
    canManageEnterprises.mockReturnValue(true);
    const existing = [
      { id: 'ent1', name: 'Old', slug: 'old', settings: {} },
      { id: 'ent2', name: 'Other', slug: 'other', settings: {} }
    ];
    configStorage.getEnterprises.mockResolvedValue(existing);
    configStorage.saveEnterprises.mockResolvedValue(undefined);

    const req = {
      method: 'PATCH',
      body: { id: 'ent1', name: 'New Name' },
      _ctx: { auth: { user: { id: 'admin' } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.enterprise).toMatchObject({
      id: 'ent1',
      name: 'New Name',
      slug: 'old'
    });

    expect(configStorage.saveEnterprises).toHaveBeenCalledTimes(1);
    const saved = configStorage.saveEnterprises.mock.calls[0][0];
    const updated = saved.find((e) => e.id === 'ent1');
    expect(updated.name).toBe('New Name');
  });

  test('PATCH: enterprise не найден → 404', async () => {
    canManageEnterprises.mockReturnValue(true);
    configStorage.getEnterprises.mockResolvedValue([]);

    const req = {
      method: 'PATCH',
      body: { id: 'missing', name: 'X' },
      _ctx: { auth: { user: { id: 'admin' } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Enterprise не найден' });
  });

  test('PATCH: конфликт по slug → 409', async () => {
    canManageEnterprises.mockReturnValue(true);
    const existing = [
      { id: 'ent1', name: 'E1', slug: 'slug1', settings: {} },
      { id: 'ent2', name: 'E2', slug: 'slug2', settings: {} }
    ];
    configStorage.getEnterprises.mockResolvedValue(existing);

    const req = {
      method: 'PATCH',
      body: { id: 'ent1', slug: 'slug2' },
      _ctx: { auth: { user: { id: 'admin' } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Enterprise с таким slug уже существует' });
  });

  test('GET: Forbidden если canViewEnterprises=false', async () => {
    canViewEnterprises.mockReturnValue(false);
    canManageEnterprises.mockReturnValue(true);
    configStorage.getEnterprises.mockResolvedValue([]);

    const req = { method: 'GET', _ctx: { auth: { user: { id: 'u' } } } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('Unauthorized если нет user', async () => {
    const req = { method: 'GET', _ctx: { auth: { user: null } } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('Method not allowed для неподдерживаемых методов', async () => {
    const req = { method: 'DELETE', _ctx: { auth: { user: { id: 'admin' } } } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });
});

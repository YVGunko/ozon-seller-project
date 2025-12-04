// pages/api/admin/sellers.test.js
// Тесты для /api/admin/sellers (GET/POST), работающих через Redis configStorage

// Мокаем withServerContext так, чтобы прокидывать ctx из req._ctx
jest.mock('../../../src/server/apiUtils', () => {
  return {
    withServerContext: (handler /*, options */) => {
      return async (req, res) => {
        const ctx =
          req._ctx ||
          {
            auth: { user: null },
            domain: {}
          };
        return handler(req, res, ctx);
      };
    }
  };
});

// Мокаем accessControl
jest.mock('../../../src/domain/services/accessControl', () => ({
  canManageEnterprises: jest.fn(() => true),
  canManageSellers: jest.fn(() => true)
}));

// Мокаем configStorage (Redis слой)
jest.mock('../../../src/services/configStorage', () => ({
  configStorage: {
    getEnterprises: jest.fn(),
    getSellers: jest.fn(),
    saveSellers: jest.fn(),
    getUsers: jest.fn(),
    saveUsers: jest.fn()
  }
}));

const {
  canManageEnterprises,
  canManageSellers
} = require('../../../src/domain/services/accessControl');
const { configStorage } = require('../../../src/services/configStorage');

const handler = require('./sellers').default;

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

describe('/api/admin/sellers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('POST: новый seller с уже существующим ozon_client_id → 400', async () => {
    canManageEnterprises.mockReturnValue(true);
    canManageSellers.mockReturnValue(true);
    configStorage.getEnterprises.mockResolvedValue([
      { id: 'ent1', name: 'E1' },
      { id: 'ent2', name: 'E2' }
    ]);
    configStorage.getSellers.mockResolvedValue([
      {
        id: '724103',
        name: 'Marmelad Market',
        enterpriseId: 'ent1',
        ozon_client_id: '724103',
        ozon_api_key: 'KEY1'
      }
    ]);

    const req = {
      method: 'POST',
      body: {
        // эмулируем "Новый магазин" без явного id
        name: 'Marmelad Market (duplicate)',
        ozon_client_id: '724103',
        ozon_api_key: 'KEY2',
        enterpriseId: 'ent2'
      },
      _ctx: {
        auth: {
          user: { id: 'manager', enterpriseId: 'ent2', roles: ['manager'] }
        }
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe(
      'Магазин с таким ozon_client_id уже существует'
    );
    expect(configStorage.saveSellers).not.toHaveBeenCalled();
  });

  test('POST: новый seller без enterpriseId → 400', async () => {
    canManageEnterprises.mockReturnValue(true);
    canManageSellers.mockReturnValue(true);
    configStorage.getEnterprises.mockResolvedValue([
      { id: 'ent1', name: 'E1' }
    ]);
    configStorage.getSellers.mockResolvedValue([]);

    const req = {
      method: 'POST',
      body: {
        // нет enterpriseId
        ozon_client_id: '123',
        ozon_api_key: 'KEY',
        name: 'Seller 123'
      },
      _ctx: { auth: { user: { id: 'admin', enterpriseId: 'ent1', roles: ['admin'] } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'enterpriseId обязателен для нового продавца'
    });
    expect(configStorage.saveSellers).not.toHaveBeenCalled();
  });

  test('POST: новый seller с несуществующим enterpriseId → 400', async () => {
    canManageEnterprises.mockReturnValue(true);
    canManageSellers.mockReturnValue(true);
    configStorage.getEnterprises.mockResolvedValue([
      { id: 'ent1', name: 'E1' }
    ]);
    configStorage.getSellers.mockResolvedValue([]);

    const req = {
      method: 'POST',
      body: {
        enterpriseId: 'missing',
        ozon_client_id: '123',
        ozon_api_key: 'KEY',
        name: 'Seller 123'
      },
      _ctx: { auth: { user: { id: 'admin', enterpriseId: 'ent1', roles: ['admin'] } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Указанный enterpriseId не найден'
    });
    expect(configStorage.saveSellers).not.toHaveBeenCalled();
  });

  test('POST: обновление существующего seller без enterpriseId сохраняет старую привязку', async () => {
    canManageEnterprises.mockReturnValue(true);
    canManageSellers.mockReturnValue(true);
    configStorage.getEnterprises.mockResolvedValue([
      { id: 'ent1', name: 'E1' }
    ]);
    configStorage.getSellers.mockResolvedValue([
      {
        id: '76251',
        name: 'Nakito',
        enterpriseId: 'ent1',
        ozon_client_id: '76251',
        ozon_api_key: 'OLD_KEY'
      }
    ]);
    configStorage.saveSellers.mockResolvedValue(undefined);
    configStorage.getUsers.mockResolvedValue([]);
    configStorage.saveUsers.mockResolvedValue(undefined);

    const req = {
      method: 'POST',
      body: {
        id: '76251',
        name: 'Nakito Updated',
        ozon_client_id: '76251'
        // enterpriseId не передаём
        // ozon_api_key тоже не передаём, чтобы остался OLD_KEY
      },
      _ctx: { auth: { user: { id: 'admin', enterpriseId: 'ent1', roles: ['admin'] } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(configStorage.saveSellers).toHaveBeenCalledTimes(1);
    const savedSellers = configStorage.saveSellers.mock.calls[0][0];
    expect(Array.isArray(savedSellers)).toBe(true);
    expect(savedSellers).toHaveLength(1);
    const saved = savedSellers[0];
    expect(saved.id).toBe('76251');
    expect(saved.enterpriseId).toBe('ent1'); // привязка к Enterprise сохранена
    expect(saved.ozon_api_key).toBe('OLD_KEY'); // ключ не изменился
  });
});

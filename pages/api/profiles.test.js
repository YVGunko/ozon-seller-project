// pages/api/profiles.test.js

jest.mock('../../src/server/apiUtils', () => {
  return {
    withServerContext: (handler /*, options */) => {
      return async (req, res) => {
        const ctx = req._ctx || { auth: { user: null } };
        return handler(req, res, ctx);
      };
    }
  };
});

jest.mock('../../src/services/configStorage', () => ({
  configStorage: {
    getSellers: jest.fn()
  }
}));

const { configStorage } = require('../../src/services/configStorage');
const handler = require('./profiles').default;

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

describe('/api/profiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('возвращает 401, если пользователь не авторизован', async () => {
    const req = { method: 'GET', _ctx: { auth: { user: null } } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  test('GET: возвращает все профили, если allowedProfiles пустой', async () => {
    configStorage.getSellers.mockResolvedValue([
      {
        id: '1',
        name: 'S1',
        ozon_client_id: '111',
        description: 'd1'
      },
      {
        id: '2',
        name: 'S2',
        ozon_client_id: '222',
        description: 'd2'
      }
    ]);

    const req = {
      method: 'GET',
      _ctx: { auth: { user: { id: 'u1', allowedProfiles: [] } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.profiles).toHaveLength(2);
    expect(res.body.profiles[0]).toMatchObject({
      id: '1',
      name: 'S1',
      client_hint: '111',
      description: 'd1'
    });
  });

  test('GET: фильтрует профили по allowedProfiles', async () => {
    configStorage.getSellers.mockResolvedValue([
      { id: '1', name: 'S1', ozon_client_id: '111' },
      { id: '2', name: 'S2', ozon_client_id: '222' },
      { id: '3', name: 'S3', ozon_client_id: '333' }
    ]);

    const req = {
      method: 'GET',
      _ctx: { auth: { user: { id: 'u1', allowedProfiles: ['2', '3'] } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const ids = res.body.profiles.map((p) => p.id);
    expect(ids).toEqual(['2', '3']);
  });
});


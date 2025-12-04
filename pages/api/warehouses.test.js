// pages/api/warehouses.test.js

jest.mock('../../src/server/apiUtils', () => {
  return {
    withServerContext: (handler /*, options */) => {
      return async (req, res) => {
        const ctx = req._ctx || {
          auth: { user: { id: 'u1' } },
          domain: { user: { id: 'u1' }, sellers: [] }
        };
        return handler(req, res, ctx);
      };
    }
  };
});

jest.mock('../../src/services/ozon-api', () => ({
  OzonApiService: jest.fn()
}));

const { OzonApiService } = require('../../src/services/ozon-api');
const handler = require('./warehouses').default;

function makeRes() {
  const res = {
    _status: 200,
    _json: null,
    _headers: {},
    setHeader(name, value) {
      this._headers[name.toLowerCase()] = value;
      return this;
    },
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

describe('/api/warehouses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('возвращает 405 для методов, отличных от GET', async () => {
    const req = { method: 'POST', _ctx: {} };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });

  test('400, если нет profileId и нет доступных sellers', async () => {
    const req = {
      method: 'GET',
      query: {},
      _ctx: { auth: { user: { id: 'u1' } }, domain: { user: { id: 'u1' }, sellers: [] } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'profileId is required' });
  });

  test('403, если seller с таким profileId недоступен пользователю', async () => {
    const req = {
      method: 'GET',
      query: { profileId: '999' },
      _ctx: {
        auth: { user: { id: 'u1' } },
        domain: {
          user: { id: 'u1' },
          sellers: [{ id: '123', externalIds: {}, metadata: {} }]
        }
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Profile is not allowed for current user' });
  });

  test('400, если у seller нет OZON учётных данных', async () => {
    const req = {
      method: 'GET',
      query: { profileId: '123' },
      _ctx: {
        auth: { user: { id: 'u1' } },
        domain: {
          user: { id: 'u1' },
          sellers: [{ id: '123', externalIds: {}, metadata: {} }]
        }
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Seller has no OZON credentials' });
  });

  test('успешно вызывает OzonApiService.getWarehouses и возвращает result', async () => {
    const getWarehousesMock = jest.fn().mockResolvedValue({
      result: [{ warehouse_id: 1 }, { warehouse_id: 2 }]
    });
    OzonApiService.mockImplementation(() => ({
      getWarehouses: getWarehousesMock
    }));

    const req = {
      method: 'GET',
      query: { profileId: '123' },
      _ctx: {
        auth: { user: { id: 'u1' } },
        domain: {
          user: { id: 'u1' },
          sellers: [
            {
              id: '123',
              externalIds: { clientId: 'CID' },
              metadata: { ozon_api_key: 'KEY' }
            }
          ]
        }
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(OzonApiService).toHaveBeenCalledWith('KEY', 'CID');
    expect(getWarehousesMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      result: [{ warehouse_id: 1 }, { warehouse_id: 2 }]
    });
  });

  test('использует ozon_client_id / ozon_api_key из сырого seller, если externalIds/metadata не заданы', async () => {
    const getWarehousesMock = jest.fn().mockResolvedValue({
      result: [{ warehouse_id: 10 }]
    });
    OzonApiService.mockImplementation(() => ({
      getWarehouses: getWarehousesMock
    }));

    const req = {
      method: 'GET',
      query: { profileId: '123' },
      _ctx: {
        auth: { user: { id: 'u1' } },
        domain: {
          user: { id: 'u1' },
          sellers: [
            {
              id: '123',
              ozon_client_id: 'CID2',
              ozon_api_key: 'KEY2'
            }
          ]
        }
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(OzonApiService).toHaveBeenCalledWith('KEY2', 'CID2');
    expect(getWarehousesMock).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      result: [{ warehouse_id: 10 }]
    });
  });
});

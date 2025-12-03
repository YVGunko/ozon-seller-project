// pages/api/actions/deactivate.test.js

jest.mock('../../../src/server/apiUtils', () => {
  return {
    withServerContext: (handler /*, options */) => {
      return async (req, res) => {
        const ctx = req._ctx || { auth: { user: null }, domain: {} };
        return handler(req, res, ctx);
      };
    }
  };
});

jest.mock('../../../src/domain/services/accessControl', () => ({
  canManagePrices: jest.fn(() => true)
}));

jest.mock('../../../src/server/serverContext', () => ({
  resolveServerContext: jest.fn()
}));

jest.mock('../../../src/services/ozon-api', () => ({
  OzonApiService: jest.fn()
}));

const { canManagePrices } = require('../../../src/domain/services/accessControl');
const { resolveServerContext } = require('../../../src/server/serverContext');
const { OzonApiService } = require('../../../src/services/ozon-api');
const handler = require('./deactivate').default;

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

describe('/api/actions/deactivate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('возвращает 405 для методов, отличных от POST', async () => {
    const req = { method: 'GET', _ctx: { auth: { user: { id: 'u' } }, domain: {} } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });

  test('возвращает 403, если canManagePrices=false', async () => {
    canManagePrices.mockReturnValue(false);

    const req = {
      method: 'POST',
      body: { action_id: 1, product_ids: [1] },
      _ctx: { auth: { user: { id: 'u' } }, domain: {} }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('валидация action_id и product_ids', async () => {
    canManagePrices.mockReturnValue(true);

    const req1 = {
      method: 'POST',
      body: { product_ids: [1] },
      _ctx: { auth: { user: { id: 'u' } }, domain: {} }
    };
    const res1 = makeRes();
    await handler(req1, res1);
    expect(res1.statusCode).toBe(400);
    expect(res1.body).toEqual({ error: 'action_id is required' });

    const req2 = {
      method: 'POST',
      body: { action_id: 1 },
      _ctx: { auth: { user: { id: 'u' } }, domain: {} }
    };
    const res2 = makeRes();
    await handler(req2, res2);
    expect(res2.statusCode).toBe(400);
    expect(res2.body).toEqual({ error: 'product_ids array is required' });
  });

  test('успешно вызывает OzonApiService.deactivateActionProducts', async () => {
    canManagePrices.mockReturnValue(true);

    resolveServerContext.mockResolvedValue({
      profile: { ozon_api_key: 'k', ozon_client_id: 'c' }
    });

    const apiInstance = {
      deactivateActionProducts: jest.fn().mockResolvedValue({
        result: { product_ids: [101], rejected: [] }
      })
    };
    OzonApiService.mockImplementation(() => apiInstance);

    const req = {
      method: 'POST',
      body: {
        action_id: 123,
        product_ids: [1, 2]
      },
      _ctx: { auth: { user: { id: 'admin' } }, domain: { user: { id: 'admin' } } }
    };
    const res = makeRes();

    await handler(req, res);

    expect(OzonApiService).toHaveBeenCalledWith('k', 'c');
    expect(apiInstance.deactivateActionProducts).toHaveBeenCalledWith({
      action_id: 123,
      product_ids: [1, 2]
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      result: { product_ids: [101], rejected: [] }
    });
  });
});


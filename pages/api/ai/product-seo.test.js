// pages/api/ai/product-seo.test.js

jest.mock('../../../src/server/apiUtils', () => {
  return {
    withServerContext: (handler /*, options */) => {
      return async (req, res) => {
        const ctx =
          req._ctx || { auth: { user: null }, domain: { user: null, activeEnterprise: null } };
        return handler(req, res, ctx);
      };
    }
  };
});

jest.mock('../../../src/domain/services/accessControl', () => ({
  canUseAiText: jest.fn(() => true)
}));

jest.mock('../../../src/modules/ai-prompts', () => {
  const actual = jest.requireActual('../../../src/modules/ai-prompts');
  return {
    ...actual,
    getAiPrompts: jest.fn()
  };
});

jest.mock('../../../src/utils/aiHelpers', () => {
  const actual = jest.requireActual('../../../src/utils/aiHelpers');
  return {
    ...actual,
    generateRichJSONWithPrompt: jest.fn(async ({ prompt }) => {
      // Возвращаем заглушку, чтобы не ходить в Groq
      return [
        {
          index: 0,
          content: { echoSystem: prompt.system, echoUser: prompt.user }
        }
      ];
    })
  };
});

const { canUseAiText } = require('../../../src/domain/services/accessControl');
const { getAiPrompts } = require('../../../src/modules/ai-prompts');
const { generateRichJSONWithPrompt } = require('../../../src/utils/aiHelpers');
const handler = require('./product-seo').default;

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

describe('/api/ai/product-seo rich prompts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rich mode: active prompt overrides base system/user', async () => {
    canUseAiText.mockReturnValue(true);

    const promptsService = {
      getActivePrompt: jest.fn().mockResolvedValue({
        id: 'p1',
        mode: 'rich',
        systemTemplate: 'CUSTOM SYSTEM {{product.name}}',
        userTemplate: 'CUSTOM USER {{product.offer_id}}'
      })
    };
    getAiPrompts.mockReturnValue(promptsService);

    const req = {
      method: 'POST',
      body: {
        mode: 'rich',
        product: {
          offer_id: 'SKU-1',
          name: 'Тестовый товар',
          price: 100,
          category_id: 123,
          attributes: {}
        }
      },
      _ctx: {
        auth: { user: { id: 'u1' } },
        domain: {
          user: { id: 'u1' },
          activeEnterprise: { id: 'e1' },
          activeSellerIds: []
        }
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(generateRichJSONWithPrompt).toHaveBeenCalled();
    const callArgs = generateRichJSONWithPrompt.mock.calls[0][0];
    const { prompt } = callArgs;

    expect(prompt.system).toBe('CUSTOM SYSTEM Тестовый товар');
    expect(prompt.user).toBe('CUSTOM USER SKU-1');
  });
});


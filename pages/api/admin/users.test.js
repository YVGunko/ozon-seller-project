// pages/api/admin/users.test.js

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
  canManageUsers: jest.fn(() => true),
  isRootAdmin: jest.fn(() => false)
}));

jest.mock('../../../src/services/configStorage', () => ({
  configStorage: {
    getUsers: jest.fn(),
    saveUsers: jest.fn()
  }
}));

jest.mock('../../../src/server/userStore', () => ({
  getAuthUsers: jest.fn(async () => []),
  reloadAuthUsersFromBlob: jest.fn(async () => undefined)
}));

const { canManageUsers, isRootAdmin } = require('../../../src/domain/services/accessControl');
const { configStorage } = require('../../../src/services/configStorage');
const { getAuthUsers } = require('../../../src/server/userStore');

const handler = require('./users').default;

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

describe('/api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET (root): возвращает всех пользователей без фильтрации', async () => {
    isRootAdmin.mockReturnValue(true);
    canManageUsers.mockReturnValue(true);

    const users = [
      { id: 'admin', username: 'admin', roles: ['admin'], profiles: ['1'], enterprises: ['ent1'] },
      { id: 'mgr', username: 'mgr', roles: ['manager'], profiles: ['1'], enterprises: ['ent1'] }
    ];
    configStorage.getUsers.mockResolvedValue(users);

    const req = {
      method: 'GET',
      _ctx: {
        auth: { user: { id: 'admin' } },
        domain: { activeEnterprise: { id: 'ent1' } }
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      id: 'admin',
      username: 'admin',
      roles: ['admin']
    });
  });

  test('GET (manager): видит только пользователей своего enterprise и не видит admin', async () => {
    isRootAdmin.mockReturnValue(false);
    canManageUsers.mockReturnValue(true);

    const users = [
      {
        id: 'admin',
        username: 'admin',
        roles: ['admin'],
        profiles: ['1'],
        enterprises: ['ent1']
      },
      {
        id: 'mgr',
        username: 'mgr',
        roles: ['manager'],
        profiles: ['1'],
        enterprises: ['ent1']
      },
      {
        id: 'other',
        username: 'other',
        roles: ['manager'],
        profiles: ['2'],
        enterprises: ['ent2']
      }
    ];
    configStorage.getUsers.mockResolvedValue(users);

    const req = {
      method: 'GET',
      _ctx: {
        auth: { user: { id: 'mgr' } },
        domain: { activeEnterprise: { id: 'ent1' } }
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const ids = res.body.items.map((u) => u.id);
    // Менеджер видит только себя, admin и пользователи из других enterprise отфильтрованы
    expect(ids).toEqual(['mgr']);
  });

  test('POST: manager не может назначить роль admin/root_admin', async () => {
    isRootAdmin.mockReturnValue(false);
    canManageUsers.mockReturnValue(true);
    configStorage.getUsers.mockResolvedValue([]);
    getAuthUsers.mockResolvedValue([]);

    const req = {
      method: 'POST',
      body: {
        username: 'u1',
        roles: ['manager', 'admin']
      },
      _ctx: {
        auth: { user: { id: 'mgr', roles: ['manager'], allowedProfiles: [] } },
        domain: {}
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/admin\/root_admin/);
  });

  test('POST: manager не может редактировать admin-пользователя', async () => {
    isRootAdmin.mockReturnValue(false);
    canManageUsers.mockReturnValue(true);

    const users = [
      {
        id: 'admin',
        username: 'admin',
        roles: ['admin'],
        profiles: ['1'],
        enterprises: ['ent1']
      },
      {
        id: 'mgr',
        username: 'mgr',
        roles: ['manager'],
        profiles: ['1'],
        enterprises: ['ent1']
      }
    ];
    configStorage.getUsers.mockResolvedValue(users);

    const req = {
      method: 'POST',
      body: {
        id: 'admin',
        username: 'admin',
        roles: ['admin']
      },
      _ctx: {
        auth: { user: { id: 'mgr', roles: ['manager'], allowedProfiles: [] } },
        domain: {}
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/admin\/root_admin/);
  });

  test('POST: manager создаёт пользователя в своём enterprise', async () => {
    isRootAdmin.mockReturnValue(false);
    canManageUsers.mockReturnValue(true);

    const users = [
      {
        id: 'mgr',
        username: 'mgr',
        roles: ['manager'],
        profiles: ['1'],
        enterprises: ['ent-1'],
        password: 'x'
      }
    ];
    configStorage.getUsers.mockResolvedValue(users);
    configStorage.saveUsers.mockResolvedValue(undefined);

    const req = {
      method: 'POST',
      body: {
        username: 'u-new',
        password: 'pass',
        roles: ['manager'],
        profiles: ['1']
      },
      _ctx: {
        auth: { user: { id: 'mgr', roles: ['manager'], allowedProfiles: ['1'] } },
        domain: {}
      }
    };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(configStorage.saveUsers).toHaveBeenCalledTimes(1);
    const savedUsers = configStorage.saveUsers.mock.calls[0][0];
    const created = savedUsers.find((u) => u.id === 'u-new' || u.username === 'u-new');
    expect(created).toBeDefined();
    expect(created.enterprises).toEqual(['ent-1']);
  });
});

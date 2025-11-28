import { ConfigService } from './configService';

const createFakeAdapter = () => {
  let state = {
    users: [],
    enterprises: [],
    sellers: []
  };

  return {
    state,
    getUsers: jest.fn(async () => state.users),
    saveUsers: jest.fn(async (users) => {
      state.users = users;
    }),
    getEnterprises: jest.fn(async () => state.enterprises),
    saveEnterprises: jest.fn(async (enterprises) => {
      state.enterprises = enterprises;
    }),
    getSellers: jest.fn(async () => state.sellers),
    saveSellers: jest.fn(async (sellers) => {
      state.sellers = sellers;
    })
  };
};

describe('ConfigService', () => {
  it('can add and update users', async () => {
    const adapter = createFakeAdapter();
    const service = new ConfigService(adapter);

    const user = { id: 'u1', email: 'test@example.com' };
    await service.addUser(user);

    expect(adapter.saveUsers).toHaveBeenCalled();
    expect(adapter.state.users).toHaveLength(1);

    const updated = await service.updateUser('u1', { email: 'new@mail.com' });

    expect(updated.email).toBe('new@mail.com');
    expect(adapter.state.users[0].email).toBe('new@mail.com');
  });

  it('returns null when updating non-existing user', async () => {
    const adapter = createFakeAdapter();
    const service = new ConfigService(adapter);

    const result = await service.updateUser('missing', { email: 'x@y.z' });
    expect(result).toBeNull();
  });
});


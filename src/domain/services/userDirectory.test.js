import { mapAuthUsersToDomainUsers } from './userDirectory';

describe('userDirectory.mapAuthUsersToDomainUsers', () => {
  test('maps auth users to domain users with enterpriseId', () => {
    const enterpriseId = 'ent-1';
    const authUsers = [
      {
        id: 'u1',
        username: 'admin@example.com',
        name: 'Admin User',
        profiles: ['3497256', 123],
        roles: ['admin']
      },
      {
        id: 'u2',
        username: 'operator',
        name: 'Operator',
        profiles: [],
        // без roles и email
      }
    ];

    const users = mapAuthUsersToDomainUsers({ enterpriseId, authUsers });

    expect(users).toHaveLength(2);

    const [u1, u2] = users;

    expect(u1.id).toBe('u1');
    expect(u1.enterpriseId).toBe(enterpriseId);
    expect(u1.email).toBe('admin@example.com');
    expect(u1.name).toBe('Admin User');
    expect(u1.roles).toEqual(['admin']);
    expect(u1.preferences.username).toBe('admin@example.com');
    expect(u1.preferences.allowedProfiles).toEqual(['3497256', '123']);

    expect(u2.id).toBe('u2');
    expect(u2.enterpriseId).toBe(enterpriseId);
    expect(u2.email).toBe('');
    expect(u2.name).toBe('Operator');
    expect(u2.roles).toEqual([]);
    expect(u2.preferences.username).toBe('operator');
    expect(u2.preferences.allowedProfiles).toEqual([]);
  });

  test('throws if enterpriseId is missing', () => {
    expect(() =>
      mapAuthUsersToDomainUsers({ enterpriseId: '', authUsers: [] })
    ).toThrow(/enterpriseId is required/);
  });
});


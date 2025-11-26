import { createRoot } from '../entities/root';
import { createEnterprise } from '../entities/enterprise';
import { createSeller } from '../entities/seller';
import { createUser } from '../entities/user';
import { mapProfileToEnterpriseAndSeller, mapAuthToUser } from './identityMapping';

describe('domain/entities basic factories', () => {
  test('createRoot returns structure with defaults', () => {
    const root = createRoot();
    expect(root.id).toBe('root');
    expect(root.name).toBe('Root');
    expect(typeof root.createdAt).toBe('string');
  });

  test('createEnterprise sets rootId and timestamps', () => {
    const ent = createEnterprise({ id: 'ent-1', name: 'Test Ent' });
    expect(ent.id).toBe('ent-1');
    expect(ent.name).toBe('Test Ent');
    expect(ent.rootId).toBe('root');
    expect(typeof ent.createdAt).toBe('string');
    expect(typeof ent.updatedAt).toBe('string');
  });

  test('createSeller binds to enterprise and marketplace', () => {
    const seller = createSeller({
      id: 'sell-1',
      enterpriseId: 'ent-1',
      marketplace: 'ozon',
      name: 'Seller 1',
      externalIds: { clientId: 'cid' }
    });
    expect(seller.id).toBe('sell-1');
    expect(seller.enterpriseId).toBe('ent-1');
    expect(seller.marketplace).toBe('ozon');
    expect(seller.externalIds.clientId).toBe('cid');
  });

  test('createUser attaches to enterprise and sellers', () => {
    const user = createUser({
      id: 'u1',
      enterpriseId: 'ent-1',
      email: 'test@example.com',
      roles: ['admin'],
      sellerIds: ['sell-1']
    });
    expect(user.id).toBe('u1');
    expect(user.enterpriseId).toBe('ent-1');
    expect(user.email).toBe('test@example.com');
    expect(user.roles).toEqual(['admin']);
    expect(user.sellerIds).toEqual(['sell-1']);
  });
});

describe('identityMapping', () => {
  test('mapProfileToEnterpriseAndSeller builds consistent hierarchy', () => {
    const profile = {
      id: 'p1',
      name: 'Ozon Profile',
      client_id: 'client-123'
    };

    const { root, enterprise, seller } = mapProfileToEnterpriseAndSeller(profile);

    expect(root.id).toBe('root');
    expect(enterprise.rootId).toBe(root.id);
    expect(enterprise.id).toBe(`ent-${profile.id}`);
    expect(seller.enterpriseId).toBe(enterprise.id);
    expect(seller.externalIds.clientId).toBe('client-123');
    expect(seller.marketplace).toBe('ozon');
  });

  test('mapAuthToUser builds User linked to enterprise', () => {
    const user = mapAuthToUser({
      userId: 'u1',
      email: 'admin@example.com',
      name: 'Admin',
      enterpriseId: 'ent-1',
      roles: ['admin'],
      sellerIds: ['sell-1', 'sell-2']
    });

    expect(user.id).toBe('u1');
    expect(user.enterpriseId).toBe('ent-1');
    expect(user.email).toBe('admin@example.com');
    expect(user.roles).toEqual(['admin']);
    expect(user.sellerIds).toEqual(['sell-1', 'sell-2']);
  });
});

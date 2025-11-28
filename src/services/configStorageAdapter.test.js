import { ConfigStorageAdapter } from './configStorageAdapter';

describe('ConfigStorageAdapter (interface)', () => {
  it('throws on unimplemented methods', async () => {
    const adapter = new ConfigStorageAdapter();

    await expect(adapter.getUsers()).rejects.toThrow();
    await expect(adapter.saveUsers([])).rejects.toThrow();
    await expect(adapter.getEnterprises()).rejects.toThrow();
    await expect(adapter.saveEnterprises([])).rejects.toThrow();
    await expect(adapter.getSellers()).rejects.toThrow();
    await expect(adapter.saveSellers([])).rejects.toThrow();
  });
});


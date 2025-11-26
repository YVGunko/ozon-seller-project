import { AiStorageService } from './aiStorageService';
import { AiStorageAdapter } from './storageAdapter';
import { AiGenerationType, AiGenerationSubType } from './types';

class InMemoryStorageAdapter extends AiStorageAdapter {
  constructor() {
    super();
    this.items = [];
  }

  async saveGeneration(generation) {
    this.items.push(generation);
  }

  async listGenerationsByUser(userId, type) {
    return this.items.filter(
      (g) => g.userId === userId && (!type || g.type === type)
    );
  }

  async getGenerationById(id) {
    return this.items.find((g) => g.id === id) || null;
  }

  async deleteGenerationById(id) {
    const before = this.items.length;
    this.items = this.items.filter((g) => g.id !== id);
    return this.items.length < before;
  }
}

describe('AiStorageService', () => {
  test('creates and stores generation with valid type/subType', async () => {
    const adapter = new InMemoryStorageAdapter();
    const service = new AiStorageService(adapter);

    const generation = await service.createGeneration({
      userId: 'user-1',
      enterpriseId: 'ent-1',
      sellerId: 'sell-1',
      type: AiGenerationType.SEO,
      subType: AiGenerationSubType.SEO_NAME,
      mode: 'seo-name',
      promptId: 'prompt-1',
      model: 'groq/compound',
      input: { mode: 'seo-name', product: { offer_id: 'TEST' } },
      prompt: 'system\n\nuser',
      output: [{ index: 0, titles: ['one'] }],
      images: []
    });

    expect(generation.id).toBeDefined();
    expect(generation.createdAt).toBeDefined();
    expect(generation.enterpriseId).toBe('ent-1');
    expect(generation.sellerId).toBe('sell-1');

    const list = await service.listUserGenerations('user-1', AiGenerationType.SEO);
    expect(list).toHaveLength(1);
    expect(list[0].promptId).toBe('prompt-1');
    expect(list[0].mode).toBe('seo-name');
  });

  test('throws on unknown type/subType', async () => {
    const adapter = new InMemoryStorageAdapter();
    const service = new AiStorageService(adapter);

    await expect(
      service.createGeneration({
        userId: 'user-1',
        // @ts-expect-error — намеренно неверный тип
        type: 'unknown-type',
        subType: AiGenerationSubType.SEO_NAME,
        model: 'groq/compound',
        input: {},
        prompt: '',
        output: null
      })
    ).rejects.toThrow(/unknown type/);

    await expect(
      service.createGeneration({
        userId: 'user-1',
        type: AiGenerationType.SEO,
        // @ts-expect-error — намеренно неверный подтип
        subType: 'unknown-subtype',
        model: 'groq/compound',
        input: {},
        prompt: '',
        output: null
      })
    ).rejects.toThrow(/unknown subType/);
  });
});

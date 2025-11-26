import { MarketplaceAdapter } from './marketplaceAdapter';
import { AttributesService } from './AttributesService';

class DummyAdapter extends MarketplaceAdapter {
  constructor() {
    super();
    this.calls = [];
  }

  async fetchDescriptionAttributesForCombo(params) {
    this.calls.push(params);
    return { attributes: [{ id: 1, name: 'test' }] };
  }
}

describe('AttributesService.fetchDescriptionAttributesForCombo', () => {
  test('throws if adapter is missing or invalid', async () => {
    await expect(
      // @ts-ignore
      AttributesService.fetchDescriptionAttributesForCombo(null, {
        descriptionCategoryId: 1,
        typeId: 2
      })
    ).rejects.toThrow(/adapter must be instance of MarketplaceAdapter/);
  });

  test('throws if params missing required ids', async () => {
    const adapter = new DummyAdapter();
    await expect(
      // @ts-ignore
      AttributesService.fetchDescriptionAttributesForCombo(adapter, {
        descriptionCategoryId: null,
        typeId: 2
      })
    ).rejects.toThrow(/descriptionCategoryId и typeId обязательны/);
  });

  test('delegates call to adapter and returns attributes', async () => {
    const adapter = new DummyAdapter();
    const result = await AttributesService.fetchDescriptionAttributesForCombo(adapter, {
      descriptionCategoryId: 17028756,
      typeId: 367249974,
      attributes: [{ id: 1 }],
      language: 'RU'
    });

    expect(result).toEqual({
      attributes: [{ id: 1, name: 'test' }]
    });
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toMatchObject({
      descriptionCategoryId: 17028756,
      typeId: 367249974,
      language: 'RU'
    });
  });
});


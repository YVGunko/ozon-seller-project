import { resolveServerContext } from '../../../src/server/serverContext';
import { OzonMarketplaceAdapter } from '../../../src/modules/marketplaces/ozonAdapter';
import { AttributesService } from '../../../src/domain/services/AttributesService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      description_category_id,
      type_id,
      attributes = [],
      language = 'DEFAULT'
    } = req.body || {};

    if (!description_category_id || !type_id) {
      return res
        .status(400)
        .json({ error: 'description_category_id и type_id обязательны' });
    }

    const { profile } = await resolveServerContext(req, res, { requireProfile: true });
    const adapter = new OzonMarketplaceAdapter(profile);

    const { attributes: metaAttributes } =
      await AttributesService.fetchDescriptionAttributesForCombo(adapter, {
        descriptionCategoryId: description_category_id,
        typeId: type_id,
        attributes,
        language
      });

    return res.status(200).json({
      description_category_id,
      type_id,
      attributes: metaAttributes
    });
  } catch (error) {
    console.error('description-attributes handler error', error);
    return res.status(500).json({
      error: 'Не удалось получить характеристики категории',
      details: error.message || String(error)
    });
  }
}

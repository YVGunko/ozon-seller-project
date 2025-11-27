import { OzonApiService } from '../../../src/services/ozon-api';
import { resolveServerContext } from '../../../src/server/serverContext';
import { canManageProducts } from '../../../src/domain/services/accessControl';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { language = 'RU' } = req.body || {};
    const { profile, user } = await resolveServerContext(req, res, { requireProfile: true });
    if (!user || !canManageProducts(user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const data = await ozon.getDescriptionCategoryTree(language);
    return res.status(200).json(data);
  } catch (error) {
    console.error('description-tree handler error', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Не удалось получить дерево категорий'
    });
  }
}

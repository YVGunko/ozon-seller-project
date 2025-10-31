import { OzonApiService } from '../../../src/services/ozon-api';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { source_offer_id, new_offer_id, modifications = {}, profile } = req.body || {};
    if (!source_offer_id || !new_offer_id) {
      return res.status(400).json({ error: 'source_offer_id and new_offer_id required' });
    }
    if (!profile) return res.status(400).json({ error: 'profile required' });

    let parsedProfile = profile;
    if (typeof profile === 'string') {
      try { parsedProfile = JSON.parse(decodeURIComponent(profile)); } catch {}
    }
    const { ozon_client_id, ozon_api_key } = parsedProfile || {};
    if (!ozon_client_id || !ozon_api_key) {
      return res.status(400).json({ error: 'Profile must include credentials' });
    }

    const service = new OzonApiService(ozon_api_key, ozon_client_id);
    const result = await service.copyProduct(source_offer_id, new_offer_id, modifications);

    return res.status(200).json(result);
  } catch (error) {
    console.error('/api/products/copy error', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
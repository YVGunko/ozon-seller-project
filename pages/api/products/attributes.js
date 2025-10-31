// pages/api/products/attributes.js
import { OzonApiService } from '../../../src/services/ozon-api';


export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { offer_id, profile } = req.body || {};
    if (!offer_id) return res.status(400).json({ error: 'offer_id required' });
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
    const attributes = await service.getProductAttributes(offer_id);

    return res.status(200).json(attributes);
  } catch (error) {
    console.error('/api/products/attributes error', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

import { generateSEOName, normalizeProductData } from '../../../src/utils/aiHelpers';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { products, keywords, baseProductData } = req.body || {};
    const normalizedBase = normalizeProductData(baseProductData);

    const result = await generateSEOName({
      products,
      keywords,
      baseProductData: normalizedBase
    });

    res.status(200).json({ descriptions: result });
  } catch (e) {
    console.error('seo-names error', e);
    res.status(500).json({ error: e.message || 'AI error' });
  }
}

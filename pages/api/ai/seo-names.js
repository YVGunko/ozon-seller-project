import { generateSEOName, normalizeProductData } from '../../../src/utils/aiHelpers';
import { withServerContext } from '../../../src/server/apiUtils';
import { canUseAiText } from '../../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = domain.user || auth.user || null;
    const enterprise = domain.activeEnterprise || null;

    if (!user || !canUseAiText(user, enterprise)) {
      return res.status(403).json({ error: 'AI functions are not allowed for this user' });
    }

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

export default withServerContext(handler, { requireAuth: true });

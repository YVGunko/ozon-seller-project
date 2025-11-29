import {
  buildAiInputsFromProduct,
  buildSeoNamePrompt,
  buildSeoDescriptionPrompt,
  buildHashtagsPrompt,
  buildRichJsonPrompt,
  debugGroqCall,
  debugReplicateSeoCall
} from '../../../src/utils/aiHelpers';
import { withServerContext } from '../../../src/server/apiUtils';
import { canUseAiText } from '../../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = domain.user || auth.user || null;
    const enterprise = domain.activeEnterprise || null;

    if (!user || !canUseAiText(user, enterprise)) {
      return res.status(403).json({ error: 'AI functions are not allowed for this user' });
    }

    const { product, mode } = req.body || {};

    if (!product || typeof product !== 'object') {
      return res.status(400).json({ error: 'Поле product обязательно' });
    }

    if (!mode || typeof mode !== 'string') {
      return res.status(400).json({ error: 'Поле mode обязательно' });
    }

    const normalizedMode = mode.toLowerCase();

    const { products, baseProductData, keywords } = buildAiInputsFromProduct(
      product,
      { mode: normalizedMode }
    );

    let promptBuilder;

    if (normalizedMode === 'title' || normalizedMode === 'seo-name') {
      promptBuilder = (ctx) => buildSeoNamePrompt(ctx);
    } else if (normalizedMode === 'description') {
      promptBuilder = (ctx) => buildSeoDescriptionPrompt(ctx);
    } else if (normalizedMode === 'hashtags') {
      promptBuilder = (ctx) => buildHashtagsPrompt(ctx);
    } else if (normalizedMode === 'rich') {
      promptBuilder = (ctx) => buildRichJsonPrompt(ctx);
    } else {
      return res.status(400).json({ error: `Режим сравнения не поддерживается: ${mode}` });
    }

    const promptContext = {
      products,
      baseProductData,
      keywords
    };

    const { system, user: userPrompt, maxTokens } = promptBuilder(promptContext);

    // Параллельно вызываем Groq и Replicate с одинаковыми промптами
    const [groqRaw, replicateRaw] = await Promise.all([
      debugGroqCall({
        system,
        user: userPrompt,
        temperature: 0.7,
        maxTokens
      }).catch((err) => `Groq error: ${err.message || String(err)}`),
      debugReplicateSeoCall({
        system,
        user: userPrompt,
        maxTokens
      }).catch((err) => `Replicate error: ${err.message || String(err)}`)
    ]);

    return res.status(200).json({
      mode: normalizedMode,
      prompts: {
        system,
        user: userPrompt,
        maxTokens
      },
      providers: {
        groq: {
          raw: groqRaw
        },
        replicate: {
          raw: replicateRaw
        }
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/ai/product-seo-compare] error', error);
    return res
      .status(500)
      .json({ error: error?.message || 'AI compare error' });
  }
}

export default withServerContext(handler, { requireAuth: true });

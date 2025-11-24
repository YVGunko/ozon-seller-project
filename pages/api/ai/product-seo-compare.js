import {
  buildAiInputsFromProduct,
  buildSeoNamePrompt,
  buildSeoDescriptionPrompt,
  buildHashtagsPrompt,
  buildRichJsonPrompt,
  debugGroqCall,
  debugReplicateSeoCall
} from '../../../src/utils/aiHelpers';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

    const ctx = {
      products,
      baseProductData,
      keywords
    };

    const { system, user, maxTokens } = promptBuilder(ctx);

    // Параллельно вызываем Groq и Replicate с одинаковыми промптами
    const [groqRaw, replicateRaw] = await Promise.all([
      debugGroqCall({
        system,
        user,
        temperature: 0.7,
        maxTokens
      }).catch((err) => `Groq error: ${err.message || String(err)}`),
      debugReplicateSeoCall({
        system,
        user,
        maxTokens
      }).catch((err) => `Replicate error: ${err.message || String(err)}`)
    ]);

    return res.status(200).json({
      mode: normalizedMode,
      prompts: {
        system,
        user,
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

import {
  buildAiInputsFromProduct,
  buildSeoNamePrompt,
  buildSeoDescriptionPrompt,
  buildHashtagsPrompt,
  buildRichJsonPrompt,
  generateSEOName,
  generateSEODescription,
  generateHashtags,
  generateRichJSON,
  generateSlides,
  GROQ_MODEL_IN_USE
} from '../../../src/utils/aiHelpers';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../src/server/authOptions';
import {
  AiGenerationType,
  AiGenerationSubType,
  getAiStorage
} from '../../../src/modules/ai-storage';

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

    const {
      products,
      baseProductData,
      keywords,
      withWatermark,
      watermarkText
    } = buildAiInputsFromProduct(product, { mode: normalizedMode });

    let items;
    let promptMeta = null;

    if (normalizedMode === 'title' || normalizedMode === 'seo-name') {
      promptMeta = buildSeoNamePrompt({
        products,
        keywords,
        baseProductData
      });
      items = await generateSEOName({
        products,
        keywords,
        baseProductData
      });
    } else if (normalizedMode === 'description') {
      promptMeta = buildSeoDescriptionPrompt({
        products,
        keywords,
        baseProductData
      });
      items = await generateSEODescription({
        products,
        keywords,
        baseProductData
      });
    } else if (normalizedMode === 'hashtags') {
      promptMeta = buildHashtagsPrompt({
        products,
        baseProductData
      });
      items = await generateHashtags({
        products,
        baseProductData
      });
    } else if (normalizedMode === 'rich') {
      promptMeta = buildRichJsonPrompt({
        products,
        baseProductData
      });
      items = await generateRichJSON({
        products,
        baseProductData
      });
    } else if (normalizedMode === 'slides') {
      items = await generateSlides({
        products,
        baseProductData,
        withWatermark,
        watermarkText
      });
    } else {
      return res.status(400).json({ error: `Неизвестный mode: ${mode}` });
    }

    // Побочно сохраняем результат генерации в ai-storage (если есть авторизованный пользователь)
    try {
      const session = await getServerSession(req, res, authOptions);
      const userId = session?.user?.id || session?.user?.email || null;

      if (userId) {
        const aiStorage = getAiStorage();
        const modelName = GROQ_MODEL_IN_USE;

        let type = AiGenerationType.CUSTOM;
        let subType = AiGenerationSubType.CUSTOM_GENERIC;

        if (normalizedMode === 'title' || normalizedMode === 'seo-name') {
          type = AiGenerationType.SEO;
          subType = AiGenerationSubType.SEO_NAME;
        } else if (normalizedMode === 'description') {
          type = AiGenerationType.SEO;
          subType = AiGenerationSubType.SEO_ANNOTATION;
        } else if (normalizedMode === 'hashtags') {
          type = AiGenerationType.META;
          subType = AiGenerationSubType.HASHTAGS;
        } else if (normalizedMode === 'rich') {
          type = AiGenerationType.RICH;
          subType = AiGenerationSubType.OZON_RICH_JSON;
        } else if (normalizedMode === 'slides') {
          type = AiGenerationType.SLIDES;
          subType = AiGenerationSubType.SLIDES_STRUCTURE;
        }

        const promptText =
          promptMeta && promptMeta.system && promptMeta.user
            ? `${promptMeta.system.trim()}\n\n${promptMeta.user.trim()}`
            : '';

        await aiStorage.createGeneration({
          userId,
          type,
          subType,
          model: modelName,
          input: {
            mode: normalizedMode,
            product,
            aiInputs: {
              products,
              baseProductData,
              keywords
            }
          },
          prompt: promptText,
          output: items,
          images: []
        });
      }
    } catch (storageError) {
      // eslint-disable-next-line no-console
      console.error('[api/ai/product-seo] aiStorage error', storageError);
      // Не ломаем основной ответ — AI‑результат всё равно возвращаем
    }

    return res.status(200).json({
      mode: normalizedMode,
      items
    });
  } catch (error) {
    console.error('[api/ai/product-seo] error', error);
    return res
      .status(500)
      .json({ error: error?.message || 'AI error' });
  }
}

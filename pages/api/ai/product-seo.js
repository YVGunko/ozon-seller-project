import {
  buildAiInputsFromProduct,
  generateSEOName,
  generateSEODescription,
  generateHashtags,
  generateRichJSON,
  generateSlides
} from '@/src/utils/aiHelpers';

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
    } = buildAiInputsFromProduct(product);

    let items;

    if (normalizedMode === 'title' || normalizedMode === 'seo-name') {
      items = await generateSEOName({
        products,
        keywords,
        baseProductData
      });
    } else if (normalizedMode === 'description') {
      items = await generateSEODescription({
        products,
        keywords,
        baseProductData
      });
    } else if (normalizedMode === 'hashtags') {
      items = await generateHashtags({
        products,
        baseProductData
      });
    } else if (normalizedMode === 'rich') {
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


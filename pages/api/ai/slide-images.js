import { put } from '@vercel/blob';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../src/server/authOptions';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res
        .status(500)
        .json({ error: 'BLOB_READ_WRITE_TOKEN is not configured on the server' });
    }

    const { slides, offerId, productName } = req.body || {};

    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(400).json({ error: 'Поле slides должно быть непустым массивом' });
    }

    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    const results = [];

    for (let index = 0; index < slides.length; index += 1) {
      const slide = slides[index] || {};
      const title = String(slide.title || `Слайд ${index + 1}`).trim();
      const subtitle = slide.subtitle ? String(slide.subtitle).trim() : '';
      const bullets = Array.isArray(slide.bullets)
        ? slide.bullets.map((b) => String(b || '').trim()).filter(Boolean)
        : [];
      const imageIdea = slide.imageIdea ? String(slide.imageIdea).trim() : '';

      const promptParts = [];
      if (productName) {
        promptParts.push(`Товар: ${productName}.`);
      }
      promptParts.push(
        `Промо-слайд 3:4 для карточки товара на Ozon, в вертикальном формате, без логотипов конкурентов.`
      );
      promptParts.push(`Заголовок слайда: "${title}".`);
      if (subtitle) {
        promptParts.push(`Подзаголовок: "${subtitle}".`);
      }
      if (bullets.length) {
        promptParts.push(
          `Ключевые пункты: ${bullets
            .map((b) => `• ${b}`)
            .join(' ')}.`
        );
      }
      if (imageIdea) {
        promptParts.push(`Идея изображения: ${imageIdea}.`);
      }
      promptParts.push(
        'Композиция в стиле маркетингового агентства MaryCo: современный, чистый дизайн, хороший контраст, читаемый объект. Можно использовать лаконичные надписи на русском языке.'
      );

      const prompt = promptParts.join(' ');

      const openaiResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: '1024x1024'
        })
      });

      const data = await openaiResponse.json();
      if (!openaiResponse.ok) {
        // eslint-disable-next-line no-console
        console.error('[slide-images] openai error', data);
        return res
          .status(openaiResponse.status)
          .json({ error: data?.error?.message || 'Failed to generate image' });
      }

      const imageUrl = data?.data?.[0]?.url;
      if (!imageUrl) {
        // eslint-disable-next-line no-console
        console.error('[slide-images] missing url in openai response');
        continue;
      }

      // Загружаем изображение по выданной модели ссылке
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        // eslint-disable-next-line no-console
        console.error('[slide-images] failed to fetch image url', imageUrl);
        continue;
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const safeOffer = String(offerId || 'product').replace(/[^a-zA-Z0-9_-]/g, '');
      const filename = `slide-${safeOffer || 'product'}-${index + 1}.png`;

      const blob = await put(filename, buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'image/png'
      });

      results.push({
        slideIndex: index,
        url: blob.url,
        pathname: blob.pathname,
        size: blob.size
      });
    }

    return res.status(200).json({ items: results });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[slide-images] handler error', error);
    return res
      .status(500)
      .json({ error: error?.message || 'Failed to generate slide images' });
  }
}

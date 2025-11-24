import { put } from '@vercel/blob';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../src/server/authOptions';
import { runReplicate } from '../../../src/utils/replicateClient';

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
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res
        .status(500)
        .json({ error: 'BLOB_READ_WRITE_TOKEN is not configured on the server' });
    }

    const replicateModel =
      process.env.REPLICATE_DEFAULT_IMAGE_MODEL ||
      process.env.REPLICATE_IMAGE_MODEL ||
      'black-forest-labs/flux-1.1-pro';

    const { slides, offerId, productName } = req.body || {};

    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(400).json({ error: 'Поле slides должно быть непустым массивом' });
    }

    const results = [];

    for (let index = 0; index < slides.length; index += 1) {
      // Чтобы не упираться в строгий rate limit Replicate (6 запросов в минуту, burst 1),
      // делаем паузу между последовательными запросами.
      if (index > 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 11000));
      }

      const slide = slides[index] || {};
      const title = String(slide.title || `Слайд ${index + 1}`).trim();
      const subtitle = slide.subtitle ? String(slide.subtitle).trim() : '';
      const bullets = Array.isArray(slide.bullets)
        ? slide.bullets.map((b) => String(b || '').trim()).filter(Boolean)
        : [];
      const imageIdea = slide.imageIdea ? String(slide.imageIdea).trim() : '';
      const overlayTitle =
        typeof slide.overlay_title_ru === 'string' && slide.overlay_title_ru.trim()
          ? slide.overlay_title_ru.trim()
          : title;
      const overlaySubtitle =
        typeof slide.overlay_subtitle_ru === 'string'
          ? slide.overlay_subtitle_ru.trim()
          : subtitle;

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
        'Композиция в стиле маркетингового агентства MaryCo: современный, чистый дизайн, хороший контраст, читаемый объект.'
      );
      promptParts.push(
        'Текст на слайде ДОЛЖЕН быть ТОЛЬКО на русском языке, кириллицей, без английских букв и псевдослов.'
      );
      promptParts.push(
        `Текст на картинке (кириллица, без ошибок). Первая строка: "${overlayTitle}". Вторая строка: "${overlaySubtitle}". Не использовать английский язык и не придумывать бессмысленные слова.`
      );

      const prompt = promptParts.join(' ');

      // Логируем финальный текстовый промпт для отладки
      // eslint-disable-next-line no-console
      console.log('[slide-images] prompt', {
        offerId,
        slideIndex: index,
        title,
        prompt
      });

      // Генерируем изображение через Replicate (flux)
      const prediction = await runReplicate({
        version: replicateModel,
        input: {
          prompt,
          aspect_ratio: '3:4',
          output_format: 'jpg',
          output_quality: 90,
          safety_tolerance: 2,
          prompt_upsampling: false
        }
      });

      const output = prediction?.output;
      let imageUrl = null;
      if (Array.isArray(output)) {
        imageUrl = output.find((item) => typeof item === 'string' && item.startsWith('http'));
      } else if (typeof output === 'string') {
        imageUrl = output;
      } else if (output && typeof output === 'object') {
        const maybeUrl = output.url || output.image || output[0];
        if (typeof maybeUrl === 'string') {
          imageUrl = maybeUrl;
        }
      }

      if (!imageUrl) {
        // eslint-disable-next-line no-console
        console.error('[slide-images] replicate output does not contain image url', output);
        continue;
      }

      // Загружаем изображение по выданной модели ссылке
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        // eslint-disable-next-line no-console
        console.error('[slide-images] failed to fetch replicate image url', imageUrl);
        continue;
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const safeOffer = String(offerId || 'product').replace(/[^a-zA-Z0-9_-]/g, '');
      const filename = `slide-${safeOffer || 'product'}-${index + 1}-flux.jpg`;

      const blob = await put(filename, buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'image/jpeg'
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

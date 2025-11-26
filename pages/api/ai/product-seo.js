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
  generateSEONameWithPrompt,
  generateSEODescriptionWithPrompt,
  generateHashtagsWithPrompt,
  generateRichJSONWithPrompt,
  generateSlidesWithPrompt,
  GROQ_MODEL_IN_USE
} from '../../../src/utils/aiHelpers';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../src/server/authOptions';
import {
  AiGenerationType,
  AiGenerationSubType,
  getAiStorage
} from '../../../src/modules/ai-storage';

import { getAiPrompts, AiPromptMode } from '../../../src/modules/ai-prompts';

function renderTemplate(template, variables) {
  if (!template || typeof template !== 'string') return '';
  const vars = variables || {};

  return template.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_, path) => {
    const keys = path.split('.');
    let value = vars;
    for (const key of keys) {
      if (value && Object.prototype.hasOwnProperty.call(value, key)) {
        value = value[key];
      } else {
        value = undefined;
        break;
      }
    }
    return value == null ? '' : String(value);
  });
}

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
    let usedPromptId = null;

    if (normalizedMode === 'title' || normalizedMode === 'seo-name') {
      // Базовый промпт, который включает весь контекст товара и атрибутов
      const basePrompt = buildSeoNamePrompt({
        products,
        keywords,
        baseProductData
      });

      // Пытаемся использовать кастомный AiPrompt для SEO-названий.
      // AiPrompt дополняет базовый промпт, а не заменяет его:
      //   system_final = base.system + extra.system (если есть)
      //   user_final   = extra.user (если есть) + base.user
      let activePrompt = null;
      try {
        const promptsService = getAiPrompts();
        activePrompt = await promptsService.getActivePrompt({
          userId: null,
          mode: AiPromptMode.SEO_NAME
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          '[api/ai/product-seo] no active AiPrompt for seo-name, using base prompt only',
          e?.message || e
        );
      }

      if (activePrompt) {
        const templateVars = {
          product,
          products,
          baseProductData,
          keywords
        };
        const extraSystem = renderTemplate(
          activePrompt.systemTemplate || '',
          templateVars
        ).trim();
        const extraUser = renderTemplate(
          activePrompt.userTemplate || '',
          templateVars
        ).trim();

        const finalSystem = extraSystem
          ? `${basePrompt.system.trim()}\n\n${extraSystem}`
          : basePrompt.system;
        const finalUser = extraUser
          ? `${extraUser}\n\n${basePrompt.user.trim()}`
          : basePrompt.user;

        promptMeta = {
          system: finalSystem,
          user: finalUser,
          temperature: basePrompt.temperature,
          maxTokens: basePrompt.maxTokens
        };
        usedPromptId = activePrompt.id;

        items = await generateSEONameWithPrompt({
          products,
          keywords,
          baseProductData,
          prompt: promptMeta
        });
      } else {
        promptMeta = basePrompt;
        items = await generateSEOName({
          products,
          keywords,
          baseProductData
        });
      }
    } else if (normalizedMode === 'description') {
      const basePrompt = buildSeoDescriptionPrompt({
        products,
        keywords,
        baseProductData
      });

      let activePrompt = null;
      try {
        const promptsService = getAiPrompts();
        activePrompt = await promptsService.getActivePrompt({
          userId: null,
          mode: AiPromptMode.SEO_DESCRIPTION
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          '[api/ai/product-seo] no active AiPrompt for description, using base prompt only',
          e?.message || e
        );
      }

      if (activePrompt) {
        const templateVars = {
          product,
          products,
          baseProductData,
          keywords
        };
        const extraSystem = renderTemplate(
          activePrompt.systemTemplate || '',
          templateVars
        ).trim();
        const extraUser = renderTemplate(
          activePrompt.userTemplate || '',
          templateVars
        ).trim();

        const finalSystem = extraSystem
          ? `${basePrompt.system.trim()}\n\n${extraSystem}`
          : basePrompt.system;
        const finalUser = extraUser
          ? `${extraUser}\n\n${basePrompt.user.trim()}`
          : basePrompt.user;

        promptMeta = {
          system: finalSystem,
          user: finalUser,
          temperature: basePrompt.temperature,
          maxTokens: basePrompt.maxTokens
        };
        usedPromptId = activePrompt.id;

        items = await generateSEODescriptionWithPrompt({
          products,
          keywords,
          baseProductData,
          prompt: promptMeta
        });
      } else {
        promptMeta = basePrompt;
        items = await generateSEODescription({
          products,
          keywords,
          baseProductData
        });
      }
    } else if (normalizedMode === 'hashtags') {
      const basePrompt = buildHashtagsPrompt({
        products,
        baseProductData
      });

      let activePrompt = null;
      try {
        const promptsService = getAiPrompts();
        activePrompt = await promptsService.getActivePrompt({
          userId: null,
          mode: AiPromptMode.HASHTAGS
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          '[api/ai/product-seo] no active AiPrompt for hashtags, using base prompt only',
          e?.message || e
        );
      }

      if (activePrompt) {
        const templateVars = {
          product,
          products,
          baseProductData,
          keywords
        };
        const extraSystem = renderTemplate(
          activePrompt.systemTemplate || '',
          templateVars
        ).trim();
        const extraUser = renderTemplate(
          activePrompt.userTemplate || '',
          templateVars
        ).trim();

        const finalSystem = extraSystem
          ? `${basePrompt.system.trim()}\n\n${extraSystem}`
          : basePrompt.system;
        const finalUser = extraUser
          ? `${extraUser}\n\n${basePrompt.user.trim()}`
          : basePrompt.user;

        promptMeta = {
          system: finalSystem,
          user: finalUser,
          temperature: basePrompt.temperature,
          maxTokens: basePrompt.maxTokens
        };
        usedPromptId = activePrompt.id;

        items = await generateHashtagsWithPrompt({
          products,
          baseProductData,
          prompt: promptMeta
        });
      } else {
        promptMeta = basePrompt;
        items = await generateHashtags({
          products,
          baseProductData
        });
      }
    } else if (normalizedMode === 'rich') {
      const basePrompt = buildRichJsonPrompt({
        products,
        baseProductData
      });

      let activePrompt = null;
      try {
        const promptsService = getAiPrompts();
        activePrompt = await promptsService.getActivePrompt({
          userId: null,
          mode: AiPromptMode.RICH
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          '[api/ai/product-seo] no active AiPrompt for rich, using base prompt only',
          e?.message || e
        );
      }

      if (activePrompt) {
        const templateVars = {
          product,
          products,
          baseProductData,
          keywords
        };
        const extraSystem = renderTemplate(
          activePrompt.systemTemplate || '',
          templateVars
        ).trim();
        const extraUser = renderTemplate(
          activePrompt.userTemplate || '',
          templateVars
        ).trim();

        const finalSystem = extraSystem
          ? `${basePrompt.system.trim()}\n\n${extraSystem}`
          : basePrompt.system;
        const finalUser = extraUser
          ? `${extraUser}\n\n${basePrompt.user.trim()}`
          : basePrompt.user;

        promptMeta = {
          system: finalSystem,
          user: finalUser,
          temperature: basePrompt.temperature,
          maxTokens: basePrompt.maxTokens
        };
        usedPromptId = activePrompt.id;

        items = await generateRichJSONWithPrompt({
          products,
          baseProductData,
          prompt: promptMeta
        });
      } else {
        promptMeta = basePrompt;
        items = await generateRichJSON({
          products,
          baseProductData
        });
      }
    } else if (normalizedMode === 'slides') {
      // Для слайдов пока оставляем прежнюю схему: базовый промпт внутри generateSlides,
      // AiPrompt может полностью переопределять структуру, если нужен другой подход.
      let activePrompt = null;
      try {
        const promptsService = getAiPrompts();
        activePrompt = await promptsService.getActivePrompt({
          userId: null,
          mode: AiPromptMode.SLIDES
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          '[api/ai/product-seo] no active AiPrompt for slides, using built-in prompt',
          e?.message || e
        );
      }

      if (activePrompt) {
        const templateVars = {
          product,
          products,
          baseProductData,
          keywords,
          withWatermark,
          watermarkText
        };
        const system = renderTemplate(activePrompt.systemTemplate, templateVars);
        const userPrompt = renderTemplate(activePrompt.userTemplate, templateVars);

        promptMeta = {
          system,
          user: userPrompt,
          temperature: 0.7,
          maxTokens: 3000
        };
        usedPromptId = activePrompt.id;

        items = await generateSlidesWithPrompt({
          products,
          baseProductData,
          withWatermark,
          watermarkText,
          prompt: promptMeta
        });
      } else {
        items = await generateSlides({
          products,
          baseProductData,
          withWatermark,
          watermarkText
        });
      }
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
          mode: normalizedMode,
          promptId: usedPromptId || null,
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

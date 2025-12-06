// pages/api/jobs/worker.js
//
import prisma from '../../../src/server/db';
import { withServerContext } from '../../../src/server/apiUtils';
import { OzonApiService } from '../../../src/services/ozon-api';
import { configStorage } from '../../../src/services/configStorage';
import { formatAttributeValues } from '../../../src/utils/attributesHelpers';
import {
  buildAiInputsFromProduct,
  generateRichJSON
} from '../../../src/utils/aiHelpers';
import { addRequestLog } from '../../../src/server/requestLogStore';

const RICH_CONTENT_ATTRIBUTE_ID = 11254;
const MODEL_CALL_DELAY_MS = 10000;

function buildAiProductFromOzon(infoItem, attributesProduct, offerId) {
  if (!infoItem && !attributesProduct) {
    throw new Error(`Нет данных товара для offer_id ${offerId}`);
  }

  const attributesMap = {};
  const attrs = Array.isArray(attributesProduct?.attributes)
    ? attributesProduct.attributes
    : [];

  attrs.forEach((attr) => {
    const rawKey =
      attr?.name ||
      attr?.attribute_name ||
      (attr?.id != null ? `attribute_${attr.id}` : null);
    if (!rawKey) return;
    const value = formatAttributeValues(attr.values || []);
    if (!value) return;
    attributesMap[String(rawKey)] = value;
  });

  let brand = infoItem?.brand || '';
  if (!brand && attributesMap.Бренд) {
    brand = attributesMap.Бренд;
  }

  const categoryName =
    infoItem?.category_name ||
    infoItem?.category ||
    attributesProduct?.category_name ||
    '';
  const typeName = infoItem?.type_name || attributesProduct?.type_name || '';

  const images =
    Array.isArray(infoItem?.images) && infoItem.images.length
      ? infoItem.images
          .map((img) =>
            typeof img === 'string'
              ? img
              : img?.primary_image ||
                img?.image ||
                img?.url ||
                img?.src ||
                ''
          )
          .filter(Boolean)
      : [];

  const price = infoItem?.price ?? null;
  const vat = infoItem?.vat ?? null;

  const descriptionCategoryId =
    attributesProduct?.description_category_id ??
    attributesProduct?.descriptionCategoryId ??
    null;
  const typeId =
    attributesProduct?.type_id ?? attributesProduct?.typeId ?? null;

  return {
    offer_id:
      attributesProduct?.offer_id ??
      attributesProduct?.offerId ??
      infoItem?.offer_id ??
      offerId,
    name: infoItem?.name || attributesProduct?.name || '',
    category_id: descriptionCategoryId,
    type_id: typeId,
    category_name: categoryName,
    type_name: typeName,
    brand,
    images,
    price,
    vat,
    section: infoItem?.section || '',
    attributes: attributesMap,
    seo_keywords: '',
    withWatermark: false,
    watermarkText: ''
  };
}

async function resolveOzonCredentials(profileId) {
  if (!profileId) {
    throw new Error('profileId не задан для элемента задачи');
  }

  const sellers = await configStorage.getSellers();
  const seller = sellers.find((s) => String(s.id) === String(profileId));

  if (!seller) {
    throw new Error(`Профиль OZON (seller) с id=${profileId} не найден в config:sellers`);
  }

  const ozonClientId =
    seller.ozon_client_id != null
      ? seller.ozon_client_id
      : seller.ozonClientId != null
        ? seller.ozonClientId
        : null;
  const ozonApiKey =
    seller.ozon_api_key != null
      ? seller.ozon_api_key
      : seller.ozonApiKey != null
        ? seller.ozonApiKey
        : null;

  if (!ozonClientId || !ozonApiKey) {
    throw new Error(
      `Профиль OZON (seller) с id=${profileId} настроен некорректно: отсутствует ozon_client_id или ozon_api_key`
    );
  }

  return {
    ozon_client_id: String(ozonClientId),
    ozon_api_key: String(ozonApiKey)
  };
}

async function runAiRichForItem(job, item) {
  const offerId = item.offerId;
  const profileId = item.profileId || job.payload?.profileId;

  if (!offerId) {
    throw new Error('offerId отсутствует в элементе задачи');
  }
  if (!profileId) {
    throw new Error(`profileId не задан для элемента задачи (offer_id ${offerId})`);
  }

  const { ozon_api_key, ozon_client_id } = await resolveOzonCredentials(
    String(profileId)
  );

  const ozon = new OzonApiService(ozon_api_key, ozon_client_id);

  // 1) Информация о товаре
  const infoResponse = await ozon.getProductInfoList([offerId]);
  const infoItems =
    (Array.isArray(infoResponse?.items) && infoResponse.items.length
      ? infoResponse.items
      : Array.isArray(infoResponse?.result?.items)
        ? infoResponse.result.items
        : []) || [];
  const infoItem = infoItems[0] || null;
  if (!infoItem) {
    throw new Error(`Не удалось получить product/info/list для offer_id ${offerId}`);
  }

  // 2) Атрибуты товара
  const attrsResponse = await ozon.getProductAttributes(offerId);
  const attrsProducts = Array.isArray(attrsResponse?.result)
    ? attrsResponse.result
    : [];
  const attrsProduct = attrsProducts[0] || null;
  if (!attrsProduct) {
    throw new Error(`Не удалось получить attributes для offer_id ${offerId}`);
  }

  // 3) Подготовка product для AI и генерация Rich‑контента
  const aiProduct = buildAiProductFromOzon(infoItem, attrsProduct, offerId);
  const { products, baseProductData } = buildAiInputsFromProduct(aiProduct, {
    mode: 'rich'
  });

  const richItems = await generateRichJSON({
    products,
    baseProductData
  });

  let ozonResponse = null;

  if (job.payload?.applyToOzon !== false) {
    const first = Array.isArray(richItems) && richItems.length ? richItems[0] : null;
    const richContent = first?.content;
    if (!richContent) {
      throw new Error('Пустой Rich‑контент от AI для отправки в OZON');
    }

    const richJsonString = JSON.stringify(richContent);

    const itemsForImport = [
      {
        offer_id: offerId,
        attributes: [
          {
            id: RICH_CONTENT_ATTRIBUTE_ID,
            values: [{ value: richJsonString }]
          }
        ]
      }
    ];

    const startedAt = Date.now();
    try {
      // Для AI‑Rich обновляем только атрибуты существующего товара,
      // не трогая базовые поля и медиа, поэтому используем
      // /v1/product/attributes/update (updateProductAttributes),
      // а не /v3/product/import.
      ozonResponse = await ozon.updateProductAttributes(itemsForImport);

      const taskId =
        ozonResponse?.result?.task_id ?? ozonResponse?.task_id ?? null;

      try {
        // Короткий лог: факт отправки обновления в OZON по конкретному offer_id.
        // eslint-disable-next-line no-console
        console.log('[jobs/worker][ai-rich] OZON attributes update', {
          offerId,
          attributeId: RICH_CONTENT_ATTRIBUTE_ID,
          taskId
        });
      } catch {
        // ignore logging issues
      }

      try {
        await addRequestLog({
          offer_id: String(offerId),
          endpoint: '/v1/product/attributes/update',
          method: 'POST',
          status: 200,
          duration_ms: Date.now() - startedAt,
          error_message: null,
          user_id: job.createdByUserId || 'jobs-worker',
          enterprise_id: job.enterpriseId || null,
          seller_id: item.sellerId || null,
          task_id: taskId
        });
      } catch (logError) {
        // eslint-disable-next-line no-console
        console.error('[jobs/worker] failed to add request log for item (success)', {
          offerId,
          error: logError
        });
      }
    } catch (error) {
      const duration = Date.now() - startedAt;
      const status = error?.status || 500;
      const message =
        error?.message || 'Ошибка обновления атрибутов через воркер';
      const errorTaskId =
        error?.data?.result?.task_id ?? error?.data?.task_id ?? null;

      try {
        await addRequestLog({
          offer_id: String(offerId),
          endpoint: '/v1/product/attributes/update',
          method: 'POST',
          status,
          duration_ms: duration,
          error_message: message,
          user_id: job.createdByUserId || 'jobs-worker',
          enterprise_id: job.enterpriseId || null,
          seller_id: item.sellerId || null,
          task_id: errorTaskId
        });
      } catch (logError) {
        // eslint-disable-next-line no-console
        console.error('[jobs/worker] failed to add request log for item (error)', {
          offerId,
          error: logError
        });
      }

      throw error;
    }
  }

  return {
    offerId,
    profileId: String(profileId),
    aiProduct,
    aiInputs: {
      products,
      baseProductData
    },
    richItems,
    ozonResponse
  };
}

async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const batchSizeParam = req.query.limit;
  const batchSize =
    typeof batchSizeParam === 'string' && Number.isFinite(Number(batchSizeParam))
      ? Math.max(1, Math.min(100, Number(batchSizeParam)))
      : 20;

  const pendingItems = await prisma.productJobItem.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    include: {
      job: true
    }
  });

  if (!pendingItems.length) {
    return res.status(200).json({
      processed: 0,
      message: 'Нет задач со статусом pending'
    });
  }

  const processedIds = [];
  const failedIds = [];
  let rateLimited = false;

  // eslint-disable-next-line no-restricted-syntax
  for (const item of pendingItems) {
    const now = new Date();

    try {
      // Короткий лог: какие элементы задачи реально попали в обработку воркером.
      // eslint-disable-next-line no-console
      console.log('[jobs/worker] processing item', {
        itemId: item.id,
        jobId: item.jobId,
        type: item.job?.type,
        offerId: item.offerId
      });
    } catch {
      // ignore logging issues
    }

    // Помечаем элемент как in_progress и увеличиваем attempts
    // eslint-disable-next-line no-await-in-loop
    await prisma.productJobItem.update({
      where: { id: item.id },
      data: {
        status: 'in_progress',
        attempts: { increment: 1 },
        startedAt: now
      }
    });

    let status = 'done';
    let lastError = null;
    let resultSnapshot = null;

    try {
      if (item.job.type === 'ai-rich') {
        // eslint-disable-next-line no-await-in-loop
        const result = await runAiRichForItem(item.job, item);
        resultSnapshot = result;
      } else {
        status = 'skipped';
      }
    } catch (error) {
      const message = error?.message || String(error);
      const isRateLimit =
        typeof message === 'string' &&
        message.toLowerCase().includes('rate limit');

      if (isRateLimit) {
        // Возвращаем элемент в pending и выходим из цикла —
        // остальные pending‑items останутся нетронутыми.
        rateLimited = true;
        // eslint-disable-next-line no-console
        console.warn('[jobs/worker] rate limit hit, stopping batch', {
          id: item.id,
          jobId: item.jobId,
          offerId: item.offerId,
          message
        });
        // eslint-disable-next-line no-await-in-loop
        await prisma.productJobItem.update({
          where: { id: item.id },
          data: {
            status: 'pending',
            lastError: message,
            // оставляем startedAt/finishedAt как есть, чтобы видеть попытку
          }
        });
        break;
      }

      status = 'failed';
      lastError = message;
      // eslint-disable-next-line no-console
      console.error('[jobs/worker] item failed', {
        id: item.id,
        jobId: item.jobId,
        offerId: item.offerId,
        error: lastError
      });
      failedIds.push(item.id);
    }

    if (!rateLimited) {
      const finishedAt = new Date();
      // eslint-disable-next-line no-await-in-loop
      await prisma.productJobItem.update({
        where: { id: item.id },
        data: {
          status,
          lastError,
          resultSnapshot,
          finishedAt
        }
      });

      if (status === 'done' || status === 'skipped') {
        processedIds.push(item.id);
      }

      if (MODEL_CALL_DELAY_MS > 0 && item.job.type === 'ai-rich') {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, MODEL_CALL_DELAY_MS));
      }
    }
  }

  // Обновляем агрегированные счётчики по задачам.
  const jobIds = Array.from(new Set(pendingItems.map((item) => item.jobId)));
  // eslint-disable-next-line no-restricted-syntax
  for (const jobId of jobIds) {
    // eslint-disable-next-line no-await-in-loop
    const [total, done, failed] = await Promise.all([
      prisma.productJobItem.count({ where: { jobId } }),
      prisma.productJobItem.count({ where: { jobId, status: 'done' } }),
      prisma.productJobItem.count({ where: { jobId, status: 'failed' } })
    ]);

    const allFinished = total === done + failed;

    const updatedJob = await prisma.productJob.update({
      where: { id: jobId },
      data: {
        totalItems: total,
        processedItems: done,
        failedItems: failed,
        status: allFinished ? 'completed' : 'running',
        startedAt: allFinished ? undefined : new Date(),
        finishedAt: allFinished ? new Date() : null
      }
    });

    try {
      // Логируем сам факт обработки задачи в общий лог импорта,
      // чтобы его было видно на странице /logs.
      // Здесь offer_id и seller_id могут быть разными для отдельных items,
      // поэтому оставляем их пустыми и фиксируем только jobId и тип.
      // eslint-disable-next-line no-await-in-loop
      await addRequestLog({
        offer_id: '',
        endpoint: '/api/jobs/worker',
        method: 'POST',
        status: 200,
        duration_ms: null,
        error_message: null,
        user_id: 'jobs-worker',
        enterprise_id: updatedJob.enterpriseId || null,
        seller_id: null,
        task_id: updatedJob.id
      });
    } catch (logError) {
      // eslint-disable-next-line no-console
      console.error('[jobs/worker] failed to add request log', logError);
    }
  }

  return res.status(200).json({
    processed: processedIds.length,
    failed: failedIds.length,
    rate_limited: rateLimited,
    processedIds,
    failedIds
  });
}

// Воркер вызывается системно (например, из Vercel Cron),
// поэтому аутентификацию здесь не требуем.
export default withServerContext(handler, { requireAuth: false });

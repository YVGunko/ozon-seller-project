// pages/api/attributes.js
import { OzonApiService } from '../../../src/services/ozon-api';
import { addRequestLog } from '../../../src/server/requestLogStore';
import { buildStatusCheckMessage, extractImportStatusItems } from '../../../src/utils/importStatus';
import { resolveServerContext } from '../../../src/server/serverContext';
import { enrichProductsWithDescriptionAttributes } from '../../../src/server/descriptionAttributesHelper';
import {
  appendPriceHistory,
  getPriceHistory
} from '../../../src/server/priceHistoryStore';
import {
  appendNetPriceHistory,
  getNetPriceHistory
} from '../../../src/server/netPriceHistoryStore';
import {
  addPendingPriceRecords,
  popPendingPricesByOffers
} from '../../../src/server/pendingPriceStore';
import {
  addPendingNetPriceRecords,
  popPendingNetPricesByOffers
} from '../../../src/server/pendingNetPriceStore';

const STATUS_CHECK_DELAY_MS = 5000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizePrice = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.');
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const extractPriceEntries = (items = []) =>
  items
    .map((item) => {
      const offerId = item?.offer_id ?? item?.offerId;
      const price = normalizePrice(item?.price);
      if (!offerId || price === null) return null;
      return { offerId: String(offerId), price };
    })
    .filter(Boolean);

const extractNetPriceEntries = (items = []) =>
  items
    .map((item) => {
      const offerId = item?.offer_id ?? item?.offerId;
      const netPrice = normalizePrice(item?.net_price ?? item?.netPrice);
      if (!offerId || netPrice === null) return null;
      return { offerId: String(offerId), netPrice };
    })
    .filter(Boolean);

const extractInfoItems = (response = {}) => {
  if (Array.isArray(response?.result?.items)) return response.result.items;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.result)) return response.result;
  return [];
};

const buildOfferSkuMap = (infoItems = []) => {
  const map = new Map();
  infoItems.forEach((item) => {
    const offerId = item?.offer_id ?? item?.offerId;
    const sku = item?.id ?? item?.product_id ?? item?.productId ?? item?.sku;
    if (offerId && sku) {
      map.set(String(offerId), String(sku));
    }
  });
  return map;
};

const extractOfferSkuPairs = (items = []) =>
  items
    .map((item) => {
      const offerId = item?.offer_id ?? item?.offerId;
      const sku = item?.product_id ?? item?.productId ?? item?.id ?? item?.sku;
      if (!offerId || !sku) return null;
      return { offerId: String(offerId), sku: String(sku) };
    })
    .filter(Boolean);

const stripNetPriceFields = (items = []) =>
  items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const copy = { ...item };
    if ('net_price' in copy) delete copy.net_price;
    if ('netPrice' in copy) delete copy.netPrice;
    return copy;
  });

const applyPendingResolutions = async ({ offerSkuPairs = [], profileId = null } = {}) => {
  if (!offerSkuPairs.length) return;
  try {
    const resolvedPrices = await popPendingPricesByOffers({ offerSkuPairs, profileId });
    await Promise.all(
      resolvedPrices.map((record) =>
        appendPriceHistory({
          sku: record.sku,
          price: record.price,
          priceData: record.data,
          ts: record.ts
        })
      )
    );
    const resolvedNet = await popPendingNetPricesByOffers({ offerSkuPairs, profileId });
    await Promise.all(
      resolvedNet.map((record) =>
        appendNetPriceHistory({
          sku: record.sku,
          netPrice: record.net_price,
          ts: record.ts
        })
      )
    );
  } catch (error) {
    console.error('[attributes] Failed to resolve pending price histories', error);
  }
};

export default async function handler(req, res) {
  try {
              console.log('attributes.js handler');
    let serverContext = null;

    if (req.method === 'GET') {
      const { offer_id } = req.query;

      if (!offer_id) {
        return res.status(400).json({ error: 'Missing offer_id' });
      }

      serverContext = await resolveServerContext(req, res, {
        requireProfile: true
      });
      const { profile } = serverContext;
      const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);

      const result = await ozon.getProductAttributes(offer_id);
      const products = Array.isArray(result?.result) ? result.result : [];

      const { products: enrichedProducts } = await enrichProductsWithDescriptionAttributes({
        ozon,
        products
      });

      return res.status(200).json({
        ...result,
        result: enrichedProducts
      });
    }

    if (req.method === 'POST') {
      const startTime = Date.now();
      let statusCode = 200;
      let responseBody = null;
      let offerIdForLog = '';
      let useImportMode = false;
      let session = null;

      try {
        const { items, mode } = req.body || {};
        useImportMode = mode === 'import';

        if (!Array.isArray(items) || items.length === 0) {
          statusCode = 400;
          responseBody = { error: 'Не переданы товары для обновления' };
          res.status(statusCode).json(responseBody);
          return;
        }

        serverContext = await resolveServerContext(req, res, {
          requireProfile: true
        });
        session = serverContext.session;
        const { profile } = serverContext;
        const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);

        offerIdForLog = String(items?.[0]?.offer_id || items?.[0]?.offerId || '');

        const priceEntries = useImportMode ? extractPriceEntries(items) : [];
        const netPriceEntries = useImportMode ? extractNetPriceEntries(items) : [];
        let offerSkuMap = new Map();

        if (useImportMode) {
          const allTrackedOffers = Array.from(
            new Set([...priceEntries, ...netPriceEntries].map((entry) => entry.offerId))
          );
          if (allTrackedOffers.length) {
            try {
              const infoResponse = await ozon.getProductInfoList(allTrackedOffers);
              offerSkuMap = buildOfferSkuMap(extractInfoItems(infoResponse));
            } catch (infoError) {
              console.error('[attributes] Failed to fetch product info for price history', infoError);
            }
          }

          for (const entry of priceEntries) {
            const sku = offerSkuMap.get(entry.offerId);
            if (!sku) continue;
            try {
              const history = await getPriceHistory(sku);
              const lastPrice = history?.[0]?.price;
              if (lastPrice !== entry.price) {
                await appendPriceHistory({ sku, price: entry.price });
              }
            } catch (error) {
              console.error('[attributes] Failed to append price history', { sku, error });
            }
          }

          for (const entry of netPriceEntries) {
            const sku = offerSkuMap.get(entry.offerId);
            if (!sku) continue;
            try {
              const history = await getNetPriceHistory(sku);
              const lastNet = history?.[0]?.net_price;
              if (lastNet !== entry.netPrice) {
                await appendNetPriceHistory({ sku, netPrice: entry.netPrice });
              }
            } catch (error) {
              console.error('[attributes] Failed to append net price history', { sku, error });
            }
          }
        }

        const sanitizedItems = useImportMode ? stripNetPriceFields(items) : items;

        const updateResult = useImportMode
          ? await ozon.importProductAttributes(sanitizedItems)
          : await ozon.updateProductAttributes(sanitizedItems);
        const taskId = updateResult?.result?.task_id;

        if (useImportMode) {
          const pendingEntries = priceEntries
            .filter((entry) => !offerSkuMap.has(entry.offerId))
            .map((entry) => ({
              offer_id: entry.offerId,
              price: entry.price,
              ts: new Date().toISOString(),
              task_id: taskId || null,
              profileId: profile?.id ?? null
            }));

          if (pendingEntries.length) {
            try {
              await addPendingPriceRecords(pendingEntries);
            } catch (error) {
              console.error('[attributes] Failed to add pending price records', error);
            }
          }

          const pendingNetEntries = netPriceEntries
            .filter((entry) => !offerSkuMap.has(entry.offerId))
            .map((entry) => ({
              offer_id: entry.offerId,
              net_price: entry.netPrice,
              ts: new Date().toISOString(),
              task_id: taskId || null,
              profileId: profile?.id ?? null
            }));

          if (pendingNetEntries.length) {
            try {
              await addPendingNetPriceRecords(pendingNetEntries);
            } catch (error) {
              console.error('[attributes] Failed to add pending net price records', error);
            }
          }
        }

        let statusResult = null;
        if (taskId) {
          try {
            statusResult = await ozon.getProductImportStatus(taskId);
          } catch (statusError) {
            statusResult = {
              error: statusError.message || 'Не удалось получить статус задачи'
            };
          }
        }

        if (useImportMode && statusResult) {
          const statusPairs = extractOfferSkuPairs(extractImportStatusItems(statusResult));
            await applyPendingResolutions({
              offerSkuPairs: statusPairs,
              profileId: profile?.id ?? null
            });
        }

        const offerIdsForStatusCheck = Array.isArray(items)
          ? items
              .map((item) => item?.offer_id ?? item?.offerId ?? null)
              .filter((id) => id !== null && id !== undefined)
              .map(String)
          : [];

        let statusCheck = null;

        if (offerIdsForStatusCheck.length) {
          try {
            await wait(STATUS_CHECK_DELAY_MS);
            const infoResponse = await ozon.getProductInfoList(offerIdsForStatusCheck);
            const infoItems = Array.isArray(infoResponse?.items)
              ? infoResponse.items
              : Array.isArray(infoResponse?.result?.items)
              ? infoResponse.result.items
              : [];
            if (useImportMode) {
              const infoPairs = extractOfferSkuPairs(infoItems);
            await applyPendingResolutions({
              offerSkuPairs: infoPairs,
              profileId: profile?.id ?? null
            });
            }
            const primaryOfferId = offerIdsForStatusCheck[0];
            const matchedItem =
              infoItems.find(
                (entry) =>
                  String(entry?.offer_id ?? entry?.offerId ?? '') === primaryOfferId
              ) || infoItems[0];

            if (matchedItem) {
              const report = buildStatusCheckMessage(matchedItem);
              statusCheck = {
                offer_id: report.offer_id ?? primaryOfferId,
                status_name: report.statusName,
                status_description: report.statusDescription,
                status_tooltip: report.statusTooltip,
                message: report.message
              };
            } else {
              statusCheck = {
                offer_id: primaryOfferId,
                error: 'Не удалось найти товар в списке статусов'
              };
            }
          } catch (statusCheckError) {
            statusCheck = {
              error:
                statusCheckError?.message ||
                'Не удалось получить актуальный статус карточки'
            };
          }
        }

        statusCode = 200;
        responseBody = {
          update: updateResult,
          status: statusResult,
          status_check: statusCheck
        };

        res.status(statusCode).json(responseBody);
      } catch (error) {
        statusCode = error.status || 500;
        responseBody = {
          error: error.message || 'Ошибка при обновлении атрибутов'
        };

        res.status(statusCode).json(responseBody);
      } finally {
        const duration = Date.now() - startTime;
        try {
          await addRequestLog({
            offer_id: offerIdForLog,
            endpoint: useImportMode
              ? '/v3/product/import'
              : '/v1/product/attributes/update',
            method: 'POST',
            status: statusCode,
            duration_ms: duration,
            error_message: statusCode >= 400 ? responseBody?.error || null : null,
            user_id: session?.user?.name || session?.user?.id || 'authenticated-user',
            enterprise_id: serverContext?.enterprise?.id || null,
            seller_id: serverContext?.seller?.id || null,
            task_id: responseBody?.update?.result?.task_id || null
          });
        } catch (logError) {
          console.error('Failed to record request log:', logError);
        }
      }

      return;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('❌ /api/attributes error:', error);
    return res.status(500).json({
      error: 'Failed to process attributes request',
      details: error.message
    });
  }
}

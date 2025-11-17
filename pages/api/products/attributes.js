// pages/api/attributes.js
import { OzonApiService } from '../../../src/services/ozon-api';
import { addRequestLog } from '../../../src/server/requestLogStore';
import { buildStatusCheckMessage } from '../../../src/utils/importStatus';
import { resolveProfileFromRequest } from '../../../src/server/profileResolver';
import { enrichProductsWithDescriptionAttributes } from '../../../src/server/descriptionAttributesHelper';

const STATUS_CHECK_DELAY_MS = 5000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  try {
              console.log('attributes.js handler');
    if (req.method === 'GET') {
      const { offer_id } = req.query;

      if (!offer_id) {
        return res.status(400).json({ error: 'Missing offer_id' });
      }

      const { profile } = await resolveProfileFromRequest(req, res);
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

        const resolved = await resolveProfileFromRequest(req, res);
        session = resolved.session;
        const { profile } = resolved;
        const ozon = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);

        offerIdForLog = String(items?.[0]?.offer_id || items?.[0]?.offerId || '');

        const updateResult = useImportMode
          ? await ozon.importProductAttributes(items)
          : await ozon.updateProductAttributes(items);
        const taskId = updateResult?.result?.task_id;

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
          addRequestLog({
            offer_id: offerIdForLog,
            endpoint: useImportMode
              ? '/v3/product/import'
              : '/v1/product/attributes/update',
            method: 'POST',
            status: statusCode,
            duration_ms: duration,
            error_message: statusCode >= 400 ? responseBody?.error || null : null,
            user_id: session?.user?.name || session?.user?.id || 'authenticated-user',
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

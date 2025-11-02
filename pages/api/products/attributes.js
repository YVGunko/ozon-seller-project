// pages/api/attributes.js
import { OzonApiService } from '../../../src/services/ozon-api';
import { addRequestLog } from '../../../src/server/requestLogStore';

const parseProfile = (rawProfile) => {
  if (!rawProfile) {
    throw new Error('Missing OZON profile');
  }

  if (typeof rawProfile === 'string') {
    try {
      return JSON.parse(decodeURIComponent(rawProfile));
    } catch {
      throw new Error('Invalid profile format');
    }
  }

  return rawProfile;
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { offer_id, profile } = req.query;

      if (!offer_id) {
        return res.status(400).json({ error: 'Missing offer_id' });
      }

      const parsedProfile = parseProfile(profile);

      const { ozon_client_id, ozon_api_key } = parsedProfile || {};
      if (!ozon_client_id || !ozon_api_key) {
        return res.status(400).json({
          error: 'Profile must include ozon_client_id and ozon_api_key'
        });
      }

      const ozon = new OzonApiService(ozon_api_key, ozon_client_id);

      const result = await ozon.getProductAttributes(offer_id);

      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const startTime = Date.now();
      let statusCode = 200;
      let responseBody = null;
      let parsedProfile = null;
      let offerIdForLog = '';

      try {
        const { items, profile } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
          statusCode = 400;
          responseBody = { error: 'Не переданы товары для обновления' };
          res.status(statusCode).json(responseBody);
          return;
        }

        parsedProfile = parseProfile(profile);
        const { ozon_client_id, ozon_api_key } = parsedProfile || {};

        if (!ozon_client_id || !ozon_api_key) {
          statusCode = 400;
          responseBody = { error: 'Profile must include ozon_client_id and ozon_api_key' };
          res.status(statusCode).json(responseBody);
          return;
        }

        offerIdForLog = String(items?.[0]?.offer_id || items?.[0]?.offerId || '');

        const ozon = new OzonApiService(ozon_api_key, ozon_client_id);
        const updateResult = await ozon.updateProductAttributes(items);
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

        statusCode = 200;
        responseBody = {
          update: updateResult,
          status: statusResult
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
            endpoint: '/v1/product/attributes/update',
            method: 'POST',
            status: statusCode,
            duration_ms: duration,
            error_message: statusCode >= 400 ? responseBody?.error || null : null,
            user_id: parsedProfile?.user_id || parsedProfile?.userId || 'local-user',
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

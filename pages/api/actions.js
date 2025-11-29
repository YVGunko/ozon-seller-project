import { OzonApiService } from '../../src/services/ozon-api';
import { withServerContext } from '../../src/server/apiUtils';

async function handler(req, res, ctx) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile } = await (await import('../../src/server/serverContext')).resolveServerContext(
      req,
      res,
      { requireProfile: true }
    );
    const service = new OzonApiService(profile.ozon_api_key, profile.ozon_client_id);
    const data = await service.getActions(req.query || {});
    return res.status(200).json(data);
  } catch (error) {
    console.error('❌ /api/actions error:', error);
    const status = error?.status || error?.statusCode || 500;
    const message = error.message || 'Failed to fetch actions';
    const code = error?.data?.code;
    const errorDetails = error?.data?.details;
    res.status(status).json({
      error: message,
      code,
      details: errorDetails || null,
      raw: error?.data || null
    });
  }
}

export default withServerContext(handler, { requireAuth: true });

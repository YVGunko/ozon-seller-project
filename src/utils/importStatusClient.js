import { buildImportStatusSummary, logImportStatusSummary } from './importStatus';

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchImportStatus = async ({
  service,
  taskId,
  delayMs = 3000,
  logger = console
}) => {
  if (!taskId) {
    throw new Error('task_id is required to fetch status');
  }

  if (delayMs > 0) {
    logger.log?.('[ImportStatus] Waiting before status check', { taskId, delayMs });
    await wait(delayMs);
  }

  logger.log?.('[ImportStatus] Checking task status', taskId);
  const statusResponse = await service.getProductImportStatus(taskId);
  const summary = buildImportStatusSummary(statusResponse);
  logImportStatusSummary(summary, logger);
  return summary;
};

export const appendImportLog = async ({
  offerId,
  productId,
  status,
  durationMs,
  errorMessage,
  taskId,
  userName,
  importMessage,
  barcode,
  barcodeError
}) => {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offer_id: offerId || '',
        product_id: productId || '',
        endpoint: '/v3/product/import',
        method: 'POST',
        status: status ?? null,
        duration_ms: durationMs ?? null,
        error_message: errorMessage || null,
        import_message: importMessage || null,
        barcode: barcode || null,
        barcode_error: barcodeError || null,
        user_id: userName || 'local-user',
        task_id: taskId || null
      })
    });
  } catch (logError) {
    console.error('[ImportStatus] Failed to append import log', logError);
  }
};

const extractBarcodes = (response = {}) => {
  if (Array.isArray(response?.result?.barcodes)) {
    return response.result.barcodes;
  }
  if (Array.isArray(response?.barcodes)) {
    return response.barcodes;
  }
  return [];
};

const extractBarcodeErrors = (response = {}) => {
  if (Array.isArray(response?.result?.errors)) {
    return response.result.errors;
  }
  if (Array.isArray(response?.errors)) {
    return response.errors;
  }
  return [];
};

export const generateBarcodesForEntries = async ({
  service,
  entries = [],
  logger = console,
  chunkSize = 100
}) => {
  if (!service || !Array.isArray(entries) || !entries.length) {
    return new Map();
  }

  const productIds = Array.from(
    new Set(
      entries
        .map((entry) => {
          const numericId = Number(entry?.productId);
          if (!Number.isFinite(numericId) || numericId <= 0) {
            return null;
          }
          return numericId;
        })
        .filter((productId) => productId !== null)
    )
  );

  if (!productIds.length) {
    return new Map();
  }

  const barcodeMap = new Map();

  try {
    for (let index = 0; index < productIds.length; index += chunkSize) {
      const chunk = productIds.slice(index, index + chunkSize);
      if (!chunk.length) continue;
      const response = await service.generateBarcodes(chunk);

      extractBarcodes(response).forEach((entry) => {
        const productId = entry?.product_id ?? entry?.productId;
        if (productId === undefined || productId === null) return;
        barcodeMap.set(String(productId), {
          barcode: entry?.barcode || null,
          barcodeError: null
        });
      });

      extractBarcodeErrors(response).forEach((entry) => {
        const productId = entry?.product_id ?? entry?.productId;
        if (productId === undefined || productId === null) return;
        const normalizedId = String(productId);
        const existing = barcodeMap.get(normalizedId) || {};
        barcodeMap.set(normalizedId, {
          barcode: entry?.barcode || existing.barcode || null,
          barcodeError: entry?.error || entry?.message || entry?.code || 'Barcode error'
        });
      });
    }

    return barcodeMap;
  } catch (error) {
    logger.error?.('[ImportStatus] Failed to generate barcodes', error);
    return new Map();
  }
};

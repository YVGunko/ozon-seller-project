import { buildImportStatusSummary, logImportStatusSummary } from './importStatus';

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchImportStatus = async ({
  service,
  taskId,
  delayMs = 3000,
  logger = console,
  attempt = 1,
  maxAttempts = 1
}) => {
  if (!taskId) {
    throw new Error('task_id is required to fetch status');
  }

  if (delayMs > 0) {
    logger.log?.('[ImportStatus] Waiting before status check', {
      taskId,
      delayMs,
      attempt,
      maxAttempts
    });
    await wait(delayMs);
  }

  logger.log?.('[ImportStatus] Checking task status', taskId);
  const statusResponse = await service.getProductImportStatus(taskId);
  const summary = buildImportStatusSummary(statusResponse);
  logImportStatusSummary(summary, logger);
  return { summary, raw: statusResponse };
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

const extractProductInfoItems = (response = {}) => {
  if (Array.isArray(response?.result?.items)) {
    return response.result.items;
  }
  if (Array.isArray(response?.items)) {
    return response.items;
  }
  return [];
};

const extractBarcodeFromProductInfo = (item = {}) => {
  if (Array.isArray(item?.barcodes) && item.barcodes.length) {
    const found = item.barcodes.find((value) => typeof value === 'string' && value.trim());
    if (found) {
      return found.trim();
    }
  }
  if (typeof item?.barcode === 'string' && item.barcode.trim()) {
    return item.barcode.trim();
  }
  return null;
};

const fetchBarcodesFromProductInfo = async ({
  service,
  offerIds = [],
  logger = console,
  chunkSize = 50
}) => {
  if (!service || !Array.isArray(offerIds) || !offerIds.length) {
    return new Map();
  }

  const normalizedOfferIds = Array.from(
    new Set(
      offerIds
        .map((id) => {
          if (typeof id === 'string') {
            return id.trim();
          }
          if (id === undefined || id === null) {
            return '';
          }
          return String(id);
        })
        .filter(Boolean)
    )
  );

  if (!normalizedOfferIds.length) {
    return new Map();
  }

  const resultMap = new Map();

  for (let index = 0; index < normalizedOfferIds.length; index += chunkSize) {
    const chunk = normalizedOfferIds.slice(index, index + chunkSize);
    if (!chunk.length) continue;
    try {
      const response = await service.getProductInfoList(chunk);
      logger.log?.('[ImportStatus] product info response for barcodes', { chunk, response });
      const items = extractProductInfoItems(response);
      items.forEach((item) => {
        const productId = item?.id ?? item?.product_id ?? item?.productId;
        if (productId === undefined || productId === null) return;
        const barcode = extractBarcodeFromProductInfo(item);
        if (!barcode) return;
        resultMap.set(String(productId), {
          barcode,
          barcodeError: null
        });
      });
    } catch (error) {
      logger.error?.('[ImportStatus] Failed to fetch product info for barcodes', {
        chunk,
        error
      });
    }
  }

  return resultMap;
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

  const normalizedEntries = entries
    .map((entry) => {
      const numericId = Number(entry?.productId);
      if (!Number.isFinite(numericId) || numericId <= 0) {
        return null;
      }
      const offerId = entry?.offerId ?? entry?.offer_id ?? null;
      return {
        productId: String(numericId),
        offerId: offerId ? String(offerId) : null
      };
    })
    .filter(Boolean);

  const productIds = Array.from(new Set(normalizedEntries.map((entry) => entry.productId)));

  if (!productIds.length) {
    return new Map();
  }

  const barcodeMap = new Map();
  const missingProductIds = new Set(productIds);
  const productIdToOfferId = new Map();
  normalizedEntries.forEach((entry) => {
    if (entry.offerId && !productIdToOfferId.has(entry.productId)) {
      productIdToOfferId.set(entry.productId, entry.offerId);
    }
  });

  try {
    for (let index = 0; index < productIds.length; index += chunkSize) {
      const chunk = productIds.slice(index, index + chunkSize);
      if (!chunk.length) continue;
      const response = await service.generateBarcodes(chunk);
      logger.log?.('[ImportStatus] barcode response', { chunk, response });

      extractBarcodes(response).forEach((entry) => {
        const productId = entry?.product_id ?? entry?.productId;
        if (productId === undefined || productId === null) return;
        const normalizedId = String(productId);
        barcodeMap.set(normalizedId, {
          barcode: entry?.barcode || null,
          barcodeError: null
        });
        missingProductIds.delete(normalizedId);
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
        missingProductIds.delete(normalizedId);
      });
    }
  } catch (error) {
    logger.error?.('[ImportStatus] Failed to generate barcodes', error);
  }

  if (missingProductIds.size > 0) {
    const fallbackOfferIds = Array.from(missingProductIds)
      .map((productId) => productIdToOfferId.get(productId))
      .filter(Boolean);
    const fallbackBarcodes = await fetchBarcodesFromProductInfo({
      service,
      offerIds: fallbackOfferIds,
      logger,
      chunkSize
    });
    fallbackBarcodes.forEach((value, productId) => {
      if (!barcodeMap.has(productId)) {
        barcodeMap.set(productId, value);
      }
      missingProductIds.delete(productId);
    });
  }

  if (missingProductIds.size > 0) {
    missingProductIds.forEach((productId) => {
      if (!barcodeMap.has(productId)) {
        barcodeMap.set(productId, {
          barcode: null,
          barcodeError: 'OZON не вернул штрихкод'
        });
      }
    });
  }

  return barcodeMap;
};

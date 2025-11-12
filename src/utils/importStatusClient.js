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
  status,
  durationMs,
  errorMessage,
  taskId,
  userName,
  importMessage
}) => {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offer_id: offerId || '',
        endpoint: '/v3/product/import',
        method: 'POST',
        status: status ?? null,
        duration_ms: durationMs ?? null,
        error_message: errorMessage || null,
        import_message: importMessage || null,
        user_id: userName || 'local-user',
        task_id: taskId || null
      })
    });
  } catch (logError) {
    console.error('[ImportStatus] Failed to append import log', logError);
  }
};


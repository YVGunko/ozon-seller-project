const buildErrorDescription = (errors) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }
  const parts = errors.map((error) => {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.code && error?.message) return `${error.code}: ${error.message}`;
    if (error?.code) return error.code;
    try {
      return JSON.stringify(error);
    } catch (jsonError) {
      return 'Неизвестная ошибка';
    }
  });
  return parts.join('; ');
};

export const buildStatusCheckMessage = (item = {}) => {
  const statuses = item.statuses || {};
  const statusName =
    statuses.status_name ??
    statuses.statusName ??
    item.status ??
    '—';
  const statusDescription =
    statuses.status_description ??
    statuses.statusDescription ??
    buildErrorDescription(item.errors) ??
    '—';
  const statusTooltip = statuses.status_tooltip ?? statuses.statusTooltip ?? '';

  const lines = [
    'Проверяю статус карточки...',
    `🧾 Статус карточки: ${statusName}`,
    `📄 Описание: ${statusDescription}`
  ];

  if (statusTooltip) {
    lines.push(`💬 Подсказка: ${statusTooltip}`);
  }

  if (
    typeof statusDescription === 'string' &&
    statusDescription.trim().toLowerCase() === 'не обновлен'
  ) {
    lines.push(
      '⚠️ Изменения не применились — проверь историю обновлений или блокировку поля.'
    );
  }

  return {
    offer_id: item.offer_id ?? item.offerId ?? null,
    statusName,
    statusDescription,
    statusTooltip,
    message: lines.join('\n')
  };
};

export const extractImportStatusItems = (statusResponse = {}) => {
  if (Array.isArray(statusResponse?.result?.items)) {
    return statusResponse.result.items;
  }

  if (Array.isArray(statusResponse?.items)) {
    return statusResponse.items;
  }

  if (Array.isArray(statusResponse?.result)) {
    return statusResponse.result;
  }

  return [];
};

export const buildImportStatusSummary = (statusResponse = {}) => {
  const taskId =
    statusResponse?.result?.task_id ??
    statusResponse?.task_id ??
    statusResponse?.result?.taskId ??
    statusResponse?.taskId ??
    null;
  const items = extractImportStatusItems(statusResponse);
  const messageEntries = items.map(buildStatusCheckMessage);

  return {
    taskId,
    items,
    messages: messageEntries,
    primaryMessage: messageEntries[0] || null
  };
};

export const logImportStatusSummary = (summary, logger = console) => {
  if (!summary) {
    logger.warn?.('[ImportStatus] Нет данных для отображения');
    return;
  }

  const { taskId, messages } = summary;
  logger.log?.('[ImportStatus] task_id:', taskId || '—');
  if (!messages || messages.length === 0) {
    logger.log?.('[ImportStatus] Сообщения о статусе отсутствуют');
    return;
  }

  messages.forEach((entry, index) => {
    const prefix = `[ImportStatus][${index + 1}]`;
    logger.log?.(`${prefix} offer_id: ${entry.offer_id || '—'}`);
    logger.log?.(`${prefix} ${entry.message}`);
  });
};

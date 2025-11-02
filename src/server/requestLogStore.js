const requestLogs = [];
const MAX_LOGS = 200;

export const addRequestLog = (entry = {}) => {
  const logEntry = {
    offer_id: entry.offer_id || '',
    endpoint: entry.endpoint || '',
    method: entry.method || '',
    status: entry.status ?? null,
    duration_ms: entry.duration_ms ?? null,
    error_message: entry.error_message || null,
    user_id: entry.user_id || 'anonymous',
    task_id: entry.task_id || null,
    timestamp: entry.timestamp || new Date().toISOString()
  };

  requestLogs.unshift(logEntry);
  if (requestLogs.length > MAX_LOGS) {
    requestLogs.length = MAX_LOGS;
  }
};

export const getRequestLogs = () => requestLogs;

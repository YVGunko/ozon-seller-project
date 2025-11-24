// src/utils/replicateClient.js
//
// Унифицированный helper для работы с Replicate
// Использует REPLICATE_API_TOKEN как локально, так и на Vercel.

const REPLICATE_BASE_URL =
  process.env.REPLICATE_API_URL || 'https://api.replicate.com/v1';

function getReplicateToken() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error('REPLICATE_API_TOKEN не задан в переменных окружения');
  }
  return token;
}

/**
 * Низкоуровневый вызов Replicate API.
 * path — путь после /v1, например "predictions".
 */
async function replicateRequest(path, options = {}) {
  const token = getReplicateToken();

  const url = `${REPLICATE_BASE_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
      ...(options.headers || {})
    }
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      data?.detail ||
      data?.error ||
      data?.message ||
      `Replicate API error (${res.status})`;
    throw new Error(message);
  }

  return data;
}

/**
 * Создать prediction (запустить модель).
 * version — это идентификатор версии модели в Replicate (hash),
 * input — объект с параметрами модели.
 */
export async function createReplicatePrediction({ version, input, webhook, webhookEventsFilter }) {
  if (!version) {
    throw new Error('version (id версии модели Replicate) обязателен');
  }

  const body = {
    version,
    input
  };

  if (webhook) {
    body.webhook = webhook;
  }
  if (webhookEventsFilter) {
    body.webhook_events_filter = webhookEventsFilter;
  }

  const prediction = await replicateRequest('predictions', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  return prediction;
}

/**
 * Получить prediction по id.
 */
export async function getReplicatePrediction(id) {
  if (!id) {
    throw new Error('id prediction обязателен');
  }
  return replicateRequest(`predictions/${id}`, { method: 'GET' });
}

/**
 * Удобный helper: запускает модель и ждёт результата.
 *
 * Пример:
 *   const result = await runReplicate({
 *     version: 'owner/model:hash',
 *     input: { prompt: '...' }
 *   });
 */
export async function runReplicate({
  version,
  input,
  pollIntervalMs = 1500,
  timeoutMs = 5 * 60 * 1000
}) {
  const startedAt = Date.now();
  const prediction = await createReplicatePrediction({ version, input });

  let current = prediction;
  while (
    current.status === 'starting' ||
    current.status === 'processing' ||
    current.status === 'queued'
  ) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Replicate prediction timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    current = await getReplicatePrediction(current.id);
  }

  if (current.status !== 'succeeded') {
    throw new Error(
      `Replicate prediction failed with status "${current.status}"` +
        (current.error ? `: ${current.error}` : '')
    );
  }

  return current;
}

export { getReplicateToken, REPLICATE_BASE_URL };


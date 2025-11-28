// src/server/apiUtils.js
//
// Общие helper'ы для API‑роутов:
//   - подключение serverContextV2
//   - единообразная обработка ошибок
//   - прокидывание ctx (auth + domain + storage) в handler

import { serverContextV2 } from './serverContextV2';

/**
 * Унифицированный обработчик ошибок для API‑роутов.
 *
 * Преобразует любые выброшенные ошибки в JSON‑ответ:
 * {
 *   error: string
 * }
 *
 * Статус берётся из error.statusCode / error.status
 * или по умолчанию 500.
 */
export function handleApiError(res, error) {
  // eslint-disable-next-line no-console
  console.error('[API ERROR]', error);

  const status =
    (typeof error?.statusCode === 'number' && error.statusCode) ||
    (typeof error?.status === 'number' && error.status) ||
    500;

  const message =
    error?.message ||
    (status === 401
      ? 'Unauthorized'
      : status === 403
        ? 'Forbidden'
        : 'Internal Server Error');

  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
}

/**
 * withServerContext(handler, options?)
 *
 * Оборачивает Next.js API‑handler и:
 *   - создаёт serverContextV2;
 *   - передаёт его в handler третьим аргументом;
 *   - ловит ошибки и преобразует их через handleApiError.
 *
 * handler: (req, res, ctx) => Promise<void>
 */
export function withServerContext(handler, options = {}) {
  return async function wrappedHandler(req, res) {
    try {
      const ctx = await serverContextV2(req, res, options);
      return await handler(req, res, ctx);
    } catch (error) {
      handleApiError(res, error);
    }
  };
}


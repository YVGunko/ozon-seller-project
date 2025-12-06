// pages/api/jobs/worker.js
//
// Базовый воркер для обработки очереди ProductJobItem.
// Сейчас он только помечает pending‑элементы как выполненные (done),
// без реального запуска AI / копирования. Это каркас для дальнейшей логики.

import prisma from '../../../src/server/db';
import { withServerContext } from '../../../src/server/apiUtils';

async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const batchSizeParam = req.query.limit;
  const batchSize =
    typeof batchSizeParam === 'string' && Number.isFinite(Number(batchSizeParam))
      ? Math.max(1, Math.min(100, Number(batchSizeParam)))
      : 20;

  const pendingItems = await prisma.productJobItem.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: batchSize
  });

  if (!pendingItems.length) {
    return res.status(200).json({
      processed: 0,
      message: 'Нет задач со статусом pending'
    });
  }

  const now = new Date();
  const ids = pendingItems.map((item) => item.id);

  // Пока что просто помечаем элементы как выполненные.
  await prisma.productJobItem.updateMany({
    where: { id: { in: ids } },
    data: {
      status: 'done',
      attempts: { increment: 1 },
      startedAt: now,
      finishedAt: now
    }
  });

  // Обновляем агрегированные счётчики по задачам (очень упрощённо).
  const jobIds = Array.from(new Set(pendingItems.map((item) => item.jobId)));
  // eslint-disable-next-line no-restricted-syntax
  for (const jobId of jobIds) {
    // eslint-disable-next-line no-await-in-loop
    const [total, done, failed] = await Promise.all([
      prisma.productJobItem.count({ where: { jobId } }),
      prisma.productJobItem.count({ where: { jobId, status: 'done' } }),
      prisma.productJobItem.count({ where: { jobId, status: 'failed' } })
    ]);

    const allFinished = total === done + failed;

    // eslint-disable-next-line no-await-in-loop
    await prisma.productJob.update({
      where: { id: jobId },
      data: {
        totalItems: total,
        processedItems: done,
        failedItems: failed,
        status: allFinished ? 'completed' : 'running',
        startedAt: allFinished ? undefined : new Date(),
        finishedAt: allFinished ? new Date() : null
      }
    });
  }

  return res.status(200).json({
    processed: pendingItems.length,
    itemIds: ids
  });
}

// Воркер вызывается системно (например, из Vercel Cron),
// поэтому аутентификацию здесь не требуем.
export default withServerContext(handler, { requireAuth: false });


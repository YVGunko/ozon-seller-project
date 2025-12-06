// pages/api/jobs/[id]/items.js
//
// Детальный список элементов задачи массовой обработки товаров.

import prisma from '../../../../src/server/db';
import { withServerContext } from '../../../../src/server/apiUtils';
import { canManageProducts } from '../../../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = domain.user || auth.user || null;
  const enterprise = domain.activeEnterprise || null;

  if (!user || !canManageProducts(user)) {
    return res.status(403).json({ error: 'Недостаточно прав для просмотра задач' });
  }

  const { id } = req.query || {};
  const jobId = Array.isArray(id) ? id[0] : id;

  if (!jobId) {
    return res.status(400).json({ error: 'Не указан идентификатор задачи' });
  }

  const whereJob = { id: jobId };
  if (enterprise?.id) {
    whereJob.enterpriseId = String(enterprise.id);
  }

  const job = await prisma.productJob.findFirst({
    where: whereJob,
    include: {
      items: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!job) {
    return res.status(404).json({ error: 'Задача не найдена' });
  }

  const items = job.items.map((item) => ({
    id: item.id,
    sellerId: item.sellerId,
    profileId: item.profileId,
    offerId: item.offerId,
    status: item.status,
    attempts: item.attempts,
    lastError: item.lastError,
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt
  }));

  const jobSummary = {
    id: job.id,
    type: job.type,
    status: job.status,
    totalItems: job.totalItems,
    processedItems: job.processedItems,
    failedItems: job.failedItems,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt
  };

  return res.status(200).json({
    job: jobSummary,
    items
  });
}

export default withServerContext(handler, { requireAuth: true });


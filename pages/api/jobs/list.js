// pages/api/jobs/list.js
//
// Получение списка задач массовой обработки товаров для текущего Enterprise.

import prisma from '../../../src/server/db';
import { withServerContext } from '../../../src/server/apiUtils';
import { canManageProducts } from '../../../src/domain/services/accessControl';

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

  const where = {};
  if (enterprise?.id) {
    where.enterpriseId = String(enterprise.id);
  }

  const jobs = await prisma.productJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return res.status(200).json({ jobs });
}

export default withServerContext(handler, { requireAuth: true });


// pages/api/jobs/enqueue.js
//
// Универсальный эндпоинт для постановки задач массовой обработки товаров
// (AI‑генерация, копирование между магазинами и т.п.).

import prisma from '../../../src/server/db';
import { withServerContext } from '../../../src/server/apiUtils';
import { canManageProducts } from '../../../src/domain/services/accessControl';

async function handler(req, res, ctx) {
  const { auth, domain } = ctx;

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = domain.user || auth.user || null;
  const enterprise = domain.activeEnterprise || null;

  if (!user || !canManageProducts(user)) {
    return res.status(403).json({ error: 'Недостаточно прав для постановки задач' });
  }

  const { type, items, payload } = req.body || {};

  if (!type || typeof type !== 'string') {
    return res.status(400).json({ error: 'Поле type обязательно' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Поле items должно быть непустым массивом' });
  }

  const normalizedItems = items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const offerId = item.offerId || item.offer_id;
      if (!offerId || typeof offerId !== 'string') return null;
      return {
        sellerId:
          item.sellerId != null
            ? String(item.sellerId)
            : item.seller_id != null
              ? String(item.seller_id)
              : null,
        profileId:
          item.profileId != null
            ? String(item.profileId)
            : item.profile_id != null
              ? String(item.profile_id)
              : null,
        offerId: String(offerId)
      };
    })
    .filter(Boolean);

  if (!normalizedItems.length) {
    return res.status(400).json({ error: 'Не удалось извлечь offer_id из items' });
  }

  const job = await prisma.productJob.create({
    data: {
      type,
      status: 'pending',
      enterpriseId: enterprise?.id ? String(enterprise.id) : null,
      createdByUserId: user.id ? String(user.id) : null,
      payload: payload && typeof payload === 'object' ? payload : {},
      totalItems: normalizedItems.length,
      items: {
        create: normalizedItems.map((item) => ({
          sellerId: item.sellerId,
          profileId: item.profileId,
          offerId: item.offerId,
          status: 'pending'
        }))
      }
    }
  });

  try {
    // Короткий лог постановки задач: какие offer_id попали в Prisma.
    // eslint-disable-next-line no-console
    console.log('[jobs/enqueue] created job', {
      jobId: job.id,
      type: job.type,
      totalItems: job.totalItems,
      offerIds: normalizedItems.map((item) => item.offerId)
    });
  } catch {
    // ignore logging errors
  }

  return res.status(201).json({
    id: job.id,
    type: job.type,
    status: job.status,
    totalItems: job.totalItems
  });
}

export default withServerContext(handler, { requireAuth: true });

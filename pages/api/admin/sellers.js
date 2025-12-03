// pages/api/admin/sellers.js
//
// Админ-эндпоинт для управления Seller-подобными сущностями,
// которые теперь хранятся в Redis (config:sellers) и привязаны
// к Enterprise через config:enterprises.
//
// Поддерживает:
//   GET  /api/admin/sellers      — список продавцов с привязкой к Enterprise
//   POST /api/admin/sellers      — создать или обновить продавца

import { withServerContext } from '../../../src/server/apiUtils';
import {
  canManageEnterprises,
  canManageSellers
} from '../../../src/domain/services/accessControl';
import { configStorage } from '../../../src/services/configStorage';

async function handler(req, res, ctx) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { auth } = ctx;
  const user = auth.user;

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const isRoot = canManageEnterprises(user);

  if (req.method === 'GET') {
    // Основной источник правды — Redis через configStorage.
    const [rawSellers] = await Promise.all([
      configStorage.getSellers()
    ]);

    const allSellers = Array.isArray(rawSellers) ? rawSellers : [];

    let visibleSellers = allSellers;

    if (!isRoot) {
      // Менеджер видит только магазины внутри своего Enterprise.
      // Берём enterpriseId из auth/user или из доменного контекста.
      const activeEnterpriseId =
        ctx.domain?.activeEnterprise?.id ||
        user.enterpriseId ||
        null;

      if (!activeEnterpriseId) {
        visibleSellers = [];
      } else {
        const entId = String(activeEnterpriseId);
        visibleSellers = allSellers.filter(
          (s) => String(s.enterpriseId || '') === entId
        );
      }
    }

    const items = visibleSellers.map((s) => {
      const ozonClientId =
        s.ozon_client_id != null
          ? s.ozon_client_id
          : s.ozonClientId != null
          ? s.ozonClientId
          : null;

      const hasApiKey = Boolean(s.ozon_api_key);

      return {
        id: String(s.id),
        name: s.name || `Seller ${s.id}`,
        ozon_client_id: ozonClientId,
        ozon_has_api_key: hasApiKey,
        client_hint:
          s.client_hint ||
          (ozonClientId ? String(ozonClientId).slice(0, 8) : ''),
        description: s.description || '',
        enterpriseId: s.enterpriseId || null
      };
    });

    return res.status(200).json({ items });
  }

  // POST: создать или обновить продавца
  const {
    id,
    name,
    ozon_client_id,
    ozon_api_key,
    client_hint,
    description,
    enterpriseId
  } = req.body || {};

  // Загружаем enterprises из Redis, чтобы проверить наличие и права.
  const enterprises = await configStorage.getEnterprises();
  const enterprisesArr = Array.isArray(enterprises) ? enterprises : [];

  const targetEnterprise = enterpriseId
    ? enterprisesArr.find((ent) => String(ent.id) === String(enterpriseId)) || null
    : null;

  if (enterpriseId && !targetEnterprise) {
    return res.status(400).json({ error: 'Указанный enterpriseId не найден' });
  }

  // Если указана организация, проверяем, что пользователь может управлять Seller в её рамках.
  if (targetEnterprise && !canManageSellers(user, targetEnterprise)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Работаем только с Redis‑хранилищем продавцов.
  const rawSellers = await configStorage.getSellers();
  let sellers = Array.isArray(rawSellers) ? [...rawSellers] : [];

  const sellerId = id ? String(id) : String(ozon_client_id);

  // Для нового Seller ozon_client_id и ozon_api_key обязательны.
  // Для существующего — можно не передавать ozon_api_key, тогда он не изменяется.
  if (!sellerId || !ozon_client_id) {
    return res
      .status(400)
      .json({ error: 'ozon_client_id обязателен для продавца' });
  }

  // Обновляем или создаём Seller
  const existingIndex = sellers.findIndex((s) => String(s.id) === sellerId);
  const baseSeller = existingIndex >= 0 ? sellers[existingIndex] : {};

  const nextApiKey =
    typeof ozon_api_key === 'string' && ozon_api_key.trim().length > 0
      ? ozon_api_key.trim()
      : baseSeller.ozon_api_key;

  if (!nextApiKey) {
    // Нет старого ключа и не передан новый — это создание/редактирование без ключа.
    return res
      .status(400)
      .json({ error: 'ozon_api_key обязателен для нового продавца' });
  }

  const normalizedEnterpriseId = enterpriseId
    ? String(enterpriseId)
    : baseSeller.enterpriseId || null;

  const updatedSeller = {
    ...baseSeller,
    id: sellerId,
    name: name || baseSeller.name || `Seller ${sellerId}`,
    ozon_client_id,
    ozon_api_key: nextApiKey,
    client_hint:
      client_hint ||
      baseSeller.client_hint ||
      String(ozon_client_id).slice(0, 8),
    description: description || baseSeller.description || '',
    enterpriseId: normalizedEnterpriseId
  };

  if (existingIndex >= 0) {
    sellers[existingIndex] = updatedSeller;
  } else {
    sellers.push(updatedSeller);
  }

  await configStorage.saveSellers(sellers);

  return res.status(200).json({
    seller: {
      id: sellerId,
      name: updatedSeller.name,
      ozon_client_id: updatedSeller.ozon_client_id,
      ozon_has_api_key: Boolean(updatedSeller.ozon_api_key),
      client_hint: updatedSeller.client_hint,
      description: updatedSeller.description,
      enterpriseId: updatedSeller.enterpriseId || null
    }
  });
}

export default withServerContext(handler, { requireAuth: true });

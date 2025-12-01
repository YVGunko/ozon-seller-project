// src/domain/services/domainResolver.js
//
// DomainResolver — чистый слой бизнес-логики.
// Объединяет user (из AuthContext) + данные (из configStorage),
// проверяет доступы и возвращает DomainContext.
//
// Модель прав:
//  - root_admin/admin → видит все Enterprise и Sellers;
//  - обычный пользователь:
//      enterprises: [enterpriseId] (обычно 1);
//      profiles:    [sellerId]     (список доступных Seller внутри Enterprise).
//
// НЕ использует Next.js, req/res, Redis напрямую — только данные.
// Легко тестируется и расширяется.

import { isRootAdmin } from './accessControl';

export class DomainResolver {
  constructor({ configStorage }) {
    if (!configStorage) {
      throw new Error("DomainResolver: configStorage is required");
    }
    this.configStorage = configStorage;
  }

  /**
   * resolve(user, options)
   *
   * user: { id, email, roles... } — из getAuthContext()
   *
   * options:
   *   - activeEnterpriseId?: string
   *   - activeSellerId?: string
   *   - activeSellerIds?: string[]
   *
   * Возвращает DomainContext:
   * {
   *   user,
   *   enterprises: [],   // Enterprise, доступные пользователю
   *   sellers: [],       // Seller (магазины), доступные пользователю
   *   activeEnterprise,
   *   activeSellerIds: []
   * }
   */
  async resolve(user, options = {}) {
    const {
      activeEnterpriseId = null,
      activeSellerId = null,
      activeSellerIds = null,
    } = options;

    // --------- 0. Пользователь не авторизован → пустой контекст ---------
    if (!user || !user.id) {
      return {
        user: null,
        enterprises: [],
        sellers: [],
        activeEnterprise: null,
        activeSellerIds: [],
      };
    }

    const isRoot = isRootAdmin(user);

    // --------- 1. Загружаем данные из хранилища ---------
    const [users, enterprises, sellers] = await Promise.all([
      this.configStorage.getUsers(),
      this.configStorage.getEnterprises(),
      this.configStorage.getSellers(),
    ]);

    const dbUser = users.find((u) => u.id === user.id);

    if (!dbUser) {
      throw new Error(`User ${user.id} not found in storage`);
    }

    // --------- 2. Нормализация массивов ---------
    const rawEnterpriseIds = Array.isArray(dbUser.enterprises)
      ? dbUser.enterprises.map((id) => String(id))
      : [];

    // Для совместимости: если когда-то появится поле enterpriseId.
    if (
      rawEnterpriseIds.length === 0 &&
      typeof dbUser.enterpriseId === 'string' &&
      dbUser.enterpriseId
    ) {
      rawEnterpriseIds.push(String(dbUser.enterpriseId));
    }

    // Новый источник seller‑доступов — profiles (sellerId).
    const rawProfileIds = Array.isArray(dbUser.profiles)
      ? dbUser.profiles.map((id) => String(id))
      : [];

    // Старое поле sellers поддерживаем как fallback.
    const legacySellerIds = Array.isArray(dbUser.sellers)
      ? dbUser.sellers.map((id) => String(id))
      : [];

    // --------- 3. Определяем списки доступных id с учётом роли ---------
    let userEnterpriseIds;
    let userSellerIds;

    if (isRoot) {
      // root/admin видит все Enterprise и всех Seller.
      userEnterpriseIds = (enterprises || []).map((ent) => String(ent.id));
      userSellerIds = (sellers || []).map((sel) => String(sel.id));
    } else {
      userEnterpriseIds = rawEnterpriseIds;

      // Если enterpriseIds ещё не выставлены, пробуем вывести их из профилей.
      if (userEnterpriseIds.length === 0 && rawProfileIds.length > 0) {
        const bySellerId = new Map();
        (sellers || []).forEach((sel) => {
          if (sel && sel.id && sel.enterpriseId) {
            bySellerId.set(String(sel.id), String(sel.enterpriseId));
          }
        });

        const derived = new Set();
        rawProfileIds.forEach((sid) => {
          const entId = bySellerId.get(sid);
          if (entId) derived.add(entId);
        });

        userEnterpriseIds = Array.from(derived);
      }

      // Новый источник seller‑доступов — profiles; при их отсутствии падаем
      // обратно на legacy sellers (если они есть).
      if (rawProfileIds.length > 0) {
        userSellerIds = rawProfileIds;
      } else {
        userSellerIds = legacySellerIds;
      }
    }

    // --------- 4. Фильтрация доступных enterprise ---------
    const userEnterprises = (enterprises || []).filter((ent) =>
      userEnterpriseIds.includes(String(ent.id))
    );

    // --------- 5. Фильтрация доступных seller ---------
    const userSellers = (sellers || []).filter((sel) =>
      userSellerIds.includes(String(sel.id))
    );

    // --------- 5. Определяем activeEnterprise ---------
    let activeEnterprise = null;

    if (activeEnterpriseId) {
      // Строгая проверка: если enterpriseId не входит в список прав пользователя — ошибка.
      if (!userEnterpriseIds.includes(activeEnterpriseId)) {
        throw new Error(
          `AccessDenied: user ${user.id} has no access to enterprise ${activeEnterpriseId}`
        );
      }

      activeEnterprise =
        userEnterprises.find((e) => e.id === activeEnterpriseId) || null;
    } else {
      // Fallback: первый доступный enterprise (если есть).
      activeEnterprise = userEnterprises[0] || null;
    }

    // --------- 6. Определяем activeSellerIds ---------
    let activeSellerIdsFinal = [];

    // (A) multiple sellers (новый режим, строгий)
    if (Array.isArray(activeSellerIds) && activeSellerIds.length > 0) {
      // Сначала жёстко проверяем доступ ко всем запрошенным seller.
      for (const sid of activeSellerIds) {
        if (!userSellerIds.includes(sid)) {
          throw new Error(
            `AccessDenied: user ${user.id} has no access to seller ${sid}`
          );
        }
      }
      activeSellerIdsFinal = [...activeSellerIds];
    }

    // (B) single seller (старый режим, тоже строгий)
    else if (activeSellerId) {
      if (!userSellerIds.includes(activeSellerId)) {
        throw new Error(
          `AccessDenied: user ${user.id} has no access to seller ${activeSellerId}`
        );
      }
      activeSellerIdsFinal = [activeSellerId];
    }

    // (C) enterprise выбран → берём всех seller enterprise
    else if (activeEnterprise) {
      activeSellerIdsFinal = userSellers
        .filter((s) => s.enterpriseId === activeEnterprise.id)
        .map((s) => s.id);
    }

    // (D) если enterprise нет → берём всех seller пользователя
    if (activeSellerIdsFinal.length === 0 && userSellers.length > 0) {
      activeSellerIdsFinal = userSellers.map((s) => s.id);
    }

    // --------- 8. Возвращаем DomainContext ---------
    return {
      user,
      enterprises: userEnterprises,
      sellers: userSellers,
      activeEnterprise,
      activeSellerIds: activeSellerIdsFinal,
    };
  }
}

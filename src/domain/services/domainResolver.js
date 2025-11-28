// src/domain/services/domainResolver.js
//
// DomainResolver — чистый слой бизнес-логики.
// Объединяет user (из AuthContext) + данные (из configStorage),
// проверяет доступы и возвращает DomainContext.
//
// НЕ использует Next.js, req/res, Redis напрямую — только данные.
// Легко тестируется и расширяется.

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
   *   enterprises: [],
   *   sellers: [],
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
    const userEnterpriseIds = Array.isArray(dbUser.enterprises)
      ? dbUser.enterprises
      : [];

    const userSellerIds = Array.isArray(dbUser.sellers)
      ? dbUser.sellers
      : [];

    // --------- 3. Фильтрация доступных enterprise ---------
    const userEnterprises = enterprises.filter((ent) =>
      userEnterpriseIds.includes(ent.id)
    );

    // --------- 4. Фильтрация доступных seller ---------
    const userSellers = sellers.filter((sel) => userSellerIds.includes(sel.id));

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

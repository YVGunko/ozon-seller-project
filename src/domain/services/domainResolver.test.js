import { DomainResolver } from "./domainResolver";

// ---- helpers ----
function mockStorage({ users = [], enterprises = [], sellers = [] }) {
  return {
    getUsers: jest.fn().mockResolvedValue(users),
    getEnterprises: jest.fn().mockResolvedValue(enterprises),
    getSellers: jest.fn().mockResolvedValue(sellers),
  };
}

function createResolverWith(data) {
  return new DomainResolver({
    configStorage: mockStorage(data),
  });
}

describe("DomainResolver (multi-seller version)", () => {
  // ---------- base test user ----------
  const baseUser = { id: "u1", email: "u1@example.com" };

  test("возвращает пустой контекст если пользователь не авторизован", async () => {
    const resolver = createResolverWith({});
    const ctx = await resolver.resolve(null);

    expect(ctx).toEqual({
      user: null,
      enterprises: [],
      sellers: [],
      activeEnterprise: null,
      activeSellerIds: [],
    });
  });

  test("кидает ошибку если пользователь не найден в хранилище", async () => {
    const resolver = createResolverWith({
      users: [],
    });

    await expect(resolver.resolve(baseUser)).rejects.toThrow(
      "User u1 not found in storage"
    );
  });

  test("нормализация массивов: если enterprises или sellers не массив → пустые", async () => {
    const resolver = createResolverWith({
      users: [{ id: "u1", enterprises: null, sellers: "sel1" }],
      enterprises: [{ id: "ent1" }],
      sellers: [{ id: "sel1" }],
    });

    const ctx = await resolver.resolve(baseUser);

    expect(ctx.enterprises).toEqual([]);
    expect(ctx.sellers).toEqual([]);
    expect(ctx.activeSellerIds).toEqual([]);
  });

  test("фильтрация enterprise и seller по доступам пользователя", async () => {
    const resolver = createResolverWith({
      users: [
        {
          id: "u1",
          enterprises: ["ent1"],
          sellers: ["sel1"],
        },
      ],
      enterprises: [
        { id: "ent1", name: "E1" },
        { id: "ent2", name: "E2" },
      ],
      sellers: [
        { id: "sel1", enterpriseId: "ent1" },
        { id: "sel2", enterpriseId: "ent1" },
      ],
    });

    const ctx = await resolver.resolve(baseUser);

    expect(ctx.enterprises).toHaveLength(1);
    expect(ctx.enterprises[0].id).toBe("ent1");

    expect(ctx.sellers).toHaveLength(1);
    expect(ctx.sellers[0].id).toBe("sel1");
  });

  test("activeEnterpriseId выбирает enterprise", async () => {
    const resolver = createResolverWith({
      users: [
        {
          id: "u1",
          enterprises: ["ent1", "ent2"],
          sellers: ["sel1", "sel2"],
        },
      ],
      enterprises: [
        { id: "ent1", name: "E1" },
        { id: "ent2", name: "E2" },
      ],
      sellers: [
        { id: "sel1", enterpriseId: "ent1" },
        { id: "sel2", enterpriseId: "ent2" },
      ],
    });

    const ctx = await resolver.resolve(baseUser, {
      activeEnterpriseId: "ent2",
    });

    expect(ctx.activeEnterprise.id).toBe("ent2");
    expect(ctx.activeSellerIds).toEqual(["sel2"]);
  });

  test("AccessDenied если enterpriseId не принадлежит пользователю", async () => {
    const resolver = createResolverWith({
      users: [{ id: "u1", enterprises: ["ent1"], sellers: [] }],
      enterprises: [{ id: "ent1" }, { id: "ent2" }],
    });

    await expect(
      resolver.resolve(baseUser, { activeEnterpriseId: "ent2" })
    ).rejects.toThrow("AccessDenied");
  });

  // -------- multi-seller tests --------

  test("activeSellerIds выбирает несколько sellers", async () => {
    const resolver = createResolverWith({
      users: [
        {
          id: "u1",
          enterprises: ["ent1"],
          sellers: ["sel1", "sel2", "sel3"],
        },
      ],
      enterprises: [{ id: "ent1" }],
      sellers: [
        { id: "sel1", enterpriseId: "ent1" },
        { id: "sel2", enterpriseId: "ent1" },
        { id: "sel3", enterpriseId: "ent1" },
      ],
    });

    const ctx = await resolver.resolve(baseUser, {
      activeSellerIds: ["sel1", "sel3"],
    });

    expect(ctx.activeSellerIds).toEqual(["sel1", "sel3"]);
  });

  test("single seller работает так же (backward compatibility)", async () => {
    const resolver = createResolverWith({
      users: [{ id: "u1", enterprises: ["ent1"], sellers: ["sel1"] }],
      enterprises: [{ id: "ent1" }],
      sellers: [{ id: "sel1", enterpriseId: "ent1" }],
    });

    const ctx = await resolver.resolve(baseUser, {
      activeSellerId: "sel1",
    });

    expect(ctx.activeSellerIds).toEqual(["sel1"]);
  });

  test("fallback: enterprise выбран → выбираем всех seller enterprise", async () => {
    const resolver = createResolverWith({
      users: [{ id: "u1", enterprises: ["ent1"], sellers: ["sel1", "sel2"] }],
      enterprises: [{ id: "ent1" }],
      sellers: [
        { id: "sel1", enterpriseId: "ent1" },
        { id: "sel2", enterpriseId: "ent1" },
      ],
    });

    const ctx = await resolver.resolve(baseUser);

    expect(ctx.activeSellerIds).toEqual(["sel1", "sel2"]);
  });

  test("fallback: если enterprise нет, но есть sellers → берём всех sellers", async () => {
    const resolver = createResolverWith({
      users: [{ id: "u1", enterprises: [], sellers: ["sel1", "sel2"] }],
      enterprises: [],
      sellers: [
        { id: "sel1", enterpriseId: null },
        { id: "sel2", enterpriseId: null },
      ],
    });

    const ctx = await resolver.resolve(baseUser);

    expect(ctx.activeSellerIds).toEqual(["sel1", "sel2"]);
  });

  test("AccessDenied если user выбирает sellerId, которого у него нет", async () => {
    const resolver = createResolverWith({
      users: [{ id: "u1", enterprises: ["ent1"], sellers: ["sel1"] }],
      enterprises: [{ id: "ent1" }],
      sellers: [
        { id: "sel1", enterpriseId: "ent1" },
        { id: "sel2", enterpriseId: "ent1" },
      ],
    });

    await expect(
      resolver.resolve(baseUser, { activeSellerIds: ["sel2"] })
    ).rejects.toThrow("AccessDenied");
  });
});


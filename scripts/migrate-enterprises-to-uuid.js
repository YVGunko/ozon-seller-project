/* scripts/migrate-enterprises-to-uuid.js
 *
 * Миграция Enterprise.id -> UUID в Redis.
 *
 * Меняет:
 *   - config:enterprises: каждое enterprise.id заменяется на UUID,
 *     старое значение id попадает в slug (если slug не был задан).
 *   - config:sellers: seller.enterpriseId переводится на новый UUID.
 *   - config:users:   enterprises[] и enterpriseId переводятся на новые UUID.
 *
 * Перед запуском:
 *   - Убедитесь, что SLRP_REDIS_URL или REDIS_URL указывает на нужный Redis.
 *   - Желательно остановить любые изменения Enterprise/Seller/User через UI
 *     на время миграции.
 *
 * Режимы:
 *   - По умолчанию DRY-RUN: только логирует, ничего не пишет.
 *   - Для выполнения миграции: DRY_RUN=false node scripts/migrate-enterprises-to-uuid.js
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { createClient } = require('redis');
const { randomUUID } = require('crypto');

// Простейшая загрузка .env / .env.local в process.env без внешних зависимостей.
function loadEnvFile(fileName) {
  try {
    const filePath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .forEach((line) => {
        const idx = line.indexOf('=');
        if (idx === -1) return;
        const key = line.slice(0, idx).trim();
        let value = line.slice(idx + 1).trim();
        // Убираем обрамляющие кавычки, если они есть: "value" или 'value'.
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      });
  } catch (e) {
    console.error(
      `[migrate-enterprises-to-uuid] Failed to load env file ${fileName}`,
      e
    );
  }
}

// Сначала пробуем подгрузить .env и .env.local
loadEnvFile('.env');
loadEnvFile('.env.local');

const redisUrl = process.env.SLRP_REDIS_URL || process.env.REDIS_URL;
const DRY_RUN = process.env.DRY_RUN !== 'false';

if (!redisUrl) {
  console.error(
    '[migrate-enterprises-to-uuid] SLRP_REDIS_URL/REDIS_URL is not set. Aborting.'
  );
  process.exit(1);
}

const ENTERPRISES_KEY = 'config:enterprises';
const SELLERS_KEY = 'config:sellers';
const USERS_KEY = 'config:users';

function parseJsonOrEmpty(raw, keyName) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    console.warn(
      `[migrate-enterprises-to-uuid] ${keyName} value is not an array, treating as empty`
    );
    return [];
  } catch (e) {
    console.error(
      `[migrate-enterprises-to-uuid] Failed to parse ${keyName} JSON, treating as empty`,
      e
    );
    return [];
  }
}

async function main() {
  console.log(
    `[migrate-enterprises-to-uuid] Starting migration (DRY_RUN=${DRY_RUN})`
  );
  console.log(`[migrate-enterprises-to-uuid] Using Redis URL: ${redisUrl}`);

  const client = createClient({ url: redisUrl });
  client.on('error', (err) => {
    console.error('[migrate-enterprises-to-uuid] Redis Client Error', err);
  });

  await client.connect();

  try {
    const [rawEnterprises, rawSellers, rawUsers] = await Promise.all([
      client.get(ENTERPRISES_KEY),
      client.get(SELLERS_KEY),
      client.get(USERS_KEY)
    ]);

    const enterprises = parseJsonOrEmpty(rawEnterprises, ENTERPRISES_KEY);
    const sellers = parseJsonOrEmpty(rawSellers, SELLERS_KEY);
    const users = parseJsonOrEmpty(rawUsers, USERS_KEY);

    console.log(
      '[migrate-enterprises-to-uuid] Loaded:',
      JSON.stringify(
        {
          enterprises: enterprises.length,
          sellers: sellers.length,
          users: users.length
        },
        null,
        2
      )
    );

    if (enterprises.length === 0) {
      console.log(
        '[migrate-enterprises-to-uuid] No enterprises found, nothing to migrate.'
      );
      return;
    }

    // 1) Строим маппинг oldId -> newUuid
    const idMap = new Map();
    const migratedEnterprises = enterprises.map((ent) => {
      if (!ent || typeof ent !== 'object') return ent;
      const oldId = String(ent.id);

      const newId = randomUUID();
      idMap.set(oldId, newId);

      const slug = ent.slug || oldId;

      return {
        ...ent,
        id: newId,
        slug
      };
    });

    console.log(
      '[migrate-enterprises-to-uuid] Generated ID mapping:',
      JSON.stringify(
        Array.from(idMap.entries()).map(([oldId, newId]) => ({
          oldId,
          newId
        })),
        null,
        2
      )
    );

    // 2) Обновляем enterpriseId в sellers
    const migratedSellers = sellers.map((s) => {
      if (!s || typeof s !== 'object') return s;
      const oldEntId = s.enterpriseId ? String(s.enterpriseId) : null;
      const newEntId = oldEntId ? idMap.get(oldEntId) : null;
      return {
        ...s,
        enterpriseId: newEntId || null
      };
    });

    // 3) Обновляем enterprises[] и enterpriseId в users
    const migratedUsers = users.map((u) => {
      if (!u || typeof u !== 'object') return u;

      const oldEnts = Array.isArray(u.enterprises)
        ? u.enterprises.map(String)
        : [];
      const newEnts = oldEnts
        .map((eid) => idMap.get(eid) || null)
        .filter(Boolean);

      const oldSingle = u.enterpriseId ? String(u.enterpriseId) : null;
      const newSingle = oldSingle ? idMap.get(oldSingle) : null;

      return {
        ...u,
        enterprises: newEnts,
        enterpriseId: newSingle || (newEnts[0] || null)
      };
    });

    // Быстрые проверки согласованности
    const newEnterpriseIds = new Set(migratedEnterprises.map((e) => String(e.id)));
    const badSellerEnts = migratedSellers
      .filter((s) => s.enterpriseId && !newEnterpriseIds.has(String(s.enterpriseId)))
      .map((s) => ({ id: s.id, enterpriseId: s.enterpriseId }));
    const badUserEnts = migratedUsers
      .flatMap((u) => {
        const ents = Array.isArray(u.enterprises) ? u.enterprises : [];
        return ents
          .filter((eid) => !newEnterpriseIds.has(String(eid)))
          .map((eid) => ({ userId: u.id || u.username, enterpriseId: eid }));
      });

    console.log(
      '[migrate-enterprises-to-uuid] Validation:',
      JSON.stringify(
        {
          badSellerEnterpriseIds: badSellerEnts,
          badUserEnterpriseIds: badUserEnts
        },
        null,
        2
      )
    );

    if (badSellerEnts.length || badUserEnts.length) {
      console.warn(
        '[migrate-enterprises-to-uuid] Found references to unknown enterprises after migration mapping. Please inspect before writing.'
      );
    }

    if (DRY_RUN) {
      console.log(
        '[migrate-enterprises-to-uuid] DRY_RUN enabled. No changes will be written to Redis.'
      );
      return;
    }

    // Резервные копии
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await Promise.all([
      client.set(
        `${ENTERPRISES_KEY}:backup:${ts}`,
        rawEnterprises || '[]'
      ),
      client.set(`${SELLERS_KEY}:backup:${ts}`, rawSellers || '[]'),
      client.set(`${USERS_KEY}:backup:${ts}`, rawUsers || '[]')
    ]);
    console.log(
      '[migrate-enterprises-to-uuid] Backups saved with timestamp',
      ts
    );

    // Запись мигрированных данных
    await Promise.all([
      client.set(ENTERPRISES_KEY, JSON.stringify(migratedEnterprises, null, 2)),
      client.set(SELLERS_KEY, JSON.stringify(migratedSellers, null, 2)),
      client.set(USERS_KEY, JSON.stringify(migratedUsers, null, 2))
    ]);

    console.log(
      '[migrate-enterprises-to-uuid] Migration completed and written to Redis.'
    );
  } finally {
    await client.quit();
  }
}

main().catch((err) => {
  console.error('[migrate-enterprises-to-uuid] Fatal error', err);
  process.exit(1);
});

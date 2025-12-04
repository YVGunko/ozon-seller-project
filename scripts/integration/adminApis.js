/* scripts/integration/adminApis.js
 *
 * Небольшой интеграционный скрипт:
 * - использует живой dev‑сервер Next.js (http://localhost:3000);
 * - логинится через NextAuth (credentials);
 * - дергает реальные API:
 *     - /api/admin/enterprises
 *     - /api/admin/sellers
 * - выводит результаты и делает пару простых проверок.
 *
 * Как использовать:
 *   1) В одном терминале: npm run dev
 *   2) В другом:         NODE_ENV=development node scripts/integration/adminApis.js
 *
 * Скрипт предполагает, что:
 *   - Redis поднят и в нём есть config:users / config:enterprises / config:sellers;
 *   - существует пользователь с логином/паролем из переменных окружения:
 *       INTEGRATION_USER, INTEGRATION_PASS
 *     или fall back на ADMIN_USER / ADMIN_PASS.
 */

/* eslint-disable no-console */

const BASE_URL = process.env.INTEGRATION_BASE_URL || 'http://localhost:3000';

const username =
  process.env.INTEGRATION_USER ||
  process.env.ADMIN_USER ||
  'admin';
const password =
  process.env.INTEGRATION_PASS ||
  process.env.ADMIN_PASS ||
  'admin';

if (!global.fetch) {
  // Node 18+ имеет глобальный fetch; если его нет, выходим с подсказкой.
  console.error(
    '[integration] global fetch is not available. Use Node.js 18+ or provide a polyfill.'
  );
  process.exit(1);
}

function mergeSetCookie(existingCookieHeader, setCookieHeader) {
  if (!setCookieHeader) return existingCookieHeader || '';
  const parts = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader];
  const cookies = parts
    .map((c) => c.split(';')[0])
    .filter(Boolean);

  if (!existingCookieHeader) {
    return cookies.join('; ');
  }

  // Простейшее объединение без дедупликации по имени.
  return `${existingCookieHeader}; ${cookies.join('; ')}`;
}

async function loginAndGetCookie() {
  console.log(`[integration] Using BASE_URL = ${BASE_URL}`);
  console.log(`[integration] Logging in as "${username}"`);

  let cookieJar = '';

  // 1) Получаем CSRF токен
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, {
    method: 'GET'
  });
  if (!csrfRes.ok) {
    throw new Error(
      `Failed to get CSRF token: ${csrfRes.status} ${csrfRes.statusText}`
    );
  }
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData?.csrfToken;
  if (!csrfToken) {
    throw new Error('CSRF token not found in /api/auth/csrf response');
  }

  cookieJar = mergeSetCookie(cookieJar, csrfRes.headers.get('set-cookie'));

  // 2) Логинимся через credentials
  const body = new URLSearchParams({
    csrfToken,
    username,
    password,
    callbackUrl: `${BASE_URL}/`
  }).toString();

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      cookie: cookieJar
    },
    redirect: 'manual' // не следуем за редиректом автоматически
  });

  cookieJar = mergeSetCookie(cookieJar, loginRes.headers.get('set-cookie'));

  if (loginRes.status !== 302 && loginRes.status !== 200) {
    const text = await loginRes.text();
    throw new Error(
      `Login failed: HTTP ${loginRes.status} ${loginRes.statusText}\n${text}`
    );
  }

  if (!cookieJar) {
    throw new Error('Login did not return any session cookies');
  }

  console.log('[integration] Login successful, cookies acquired');
  return cookieJar;
}

async function fetchJson(path, cookieJar) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      cookie: cookieJar
    }
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(
      `Failed to parse JSON from ${path}: ${e.message}\nResponse text:\n${text}`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Request to ${path} failed: ${res.status} ${res.statusText}\n${text}`
    );
  }
  return json;
}

async function run() {
  try {
    const cookieJar = await loginAndGetCookie();

    // --- /api/admin/enterprises ---
    const enterprises = await fetchJson('/api/admin/enterprises', cookieJar);
    console.log(
      '[integration] /api/admin/enterprises:',
      JSON.stringify(enterprises, null, 2)
    );

    if (!enterprises || !Array.isArray(enterprises.items)) {
      throw new Error(
        '/api/admin/enterprises: response does not contain items array'
      );
    }

    // --- /api/admin/sellers ---
    const sellers = await fetchJson('/api/admin/sellers', cookieJar);
    console.log(
      '[integration] /api/admin/sellers:',
      JSON.stringify(sellers, null, 2)
    );

    if (!sellers || !Array.isArray(sellers.items)) {
      throw new Error('/api/admin/sellers: response does not contain items array');
    }

    console.log('\n[integration] Checks completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('[integration] ERROR:', error);
    process.exit(1);
  }
}

run();


import { list } from '@vercel/blob';

const { AUTH_USERS, ADMIN_USER, ADMIN_PASS, ADMIN_PROFILES, CONFIG_USERS_BLOB_PREFIX } =
  process.env;

const USERS_BLOB_PREFIX = CONFIG_USERS_BLOB_PREFIX || 'config/users.json';

const parseJsonEnv = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('[userStore] Failed to parse JSON env', error);
    return fallback;
  }
};

const normalizeUsers = (rawUsers = []) => {
  if (!Array.isArray(rawUsers)) return [];
  return rawUsers
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const username = entry.username || entry.user || entry.login;
      const password = entry.password || entry.pass || '';
      const id = entry.id || username || `user-${index + 1}`;
      if (!username || !password) return null;
      const profiles = Array.isArray(entry.profiles)
        ? entry.profiles.map((profileId) => String(profileId))
        : [];
      const roles = Array.isArray(entry.roles)
        ? entry.roles.map((role) => String(role)).filter(Boolean)
        : [];
      const email =
        typeof entry.email === 'string' && entry.email
          ? entry.email
          : username.includes('@')
          ? username
          : '';
      return {
        id: String(id),
        username: String(username),
        password: String(password),
        name: entry.name || username,
        profiles,
        roles,
        email
      };
    })
    .filter(Boolean);
};

const buildFallbackUsers = () => {
  const username = ADMIN_USER;
  const password = ADMIN_PASS;
  if (!username || !password) {
    return [];
  }
  const rawProfiles = ADMIN_PROFILES || '';
  const profiles = rawProfiles
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const email = username.includes('@') ? username : '';
  return [
    {
      id: 'admin',
      username,
      password,
      name: 'Administrator',
      profiles,
      roles: ['admin'],
      email
    }
  ];
};

let cachedUsers = null;

const loadUsersFromEnv = () => {
  const configured = normalizeUsers(parseJsonEnv(AUTH_USERS, []));
  if (configured.length > 0) {
    console.log('[userStore] using AUTH_USERS from env, users:', configured.length);
    return configured;
  }
  const fallback = normalizeUsers(buildFallbackUsers());
  if (fallback.length > 0) {
    console.log('[userStore] using ADMIN_* fallback user');
  } else {
    console.warn('[userStore] no users configured in env (AUTH_USERS or ADMIN_*)');
  }
  return fallback;
};

async function loadUsersFromBlob() {
  try {
    const { blobs } = await list({ prefix: USERS_BLOB_PREFIX });
    if (!blobs || blobs.length === 0) {
      console.log(
        '[userStore] no users config blob found, prefix =',
        USERS_BLOB_PREFIX
      );
      return null;
    }

    const blob = blobs[0];
    const downloadUrl = blob.downloadUrl || blob.url;
    const res = await fetch(downloadUrl);
    const text = await res.text();
    const json = JSON.parse(text);

    if (!Array.isArray(json)) {
      console.error(
        '[userStore] users config blob is not an array, pathname =',
        blob.pathname
      );
      return null;
    }

    console.log(
      '[userStore] loaded users from Blob',
      JSON.stringify({ count: json.length, pathname: blob.pathname })
    );

    return normalizeUsers(json);
  } catch (error) {
    console.error('[userStore] failed to load users from Blob, fallback to env', error);
    return null;
  }
}

export const getAuthUsers = async () => {
  if (cachedUsers) return cachedUsers;

  // Пытаемся сначала загрузить конфиг из Blob.
  const fromBlob = await loadUsersFromBlob();
  if (fromBlob && fromBlob.length > 0) {
    cachedUsers = fromBlob;
    return cachedUsers;
  }

  // Фолбэк — env.
  cachedUsers = loadUsersFromEnv();
  return cachedUsers;
};

/**
 * Сбросить кэш и принудительно перечитать пользователей из Blob/ENV.
 * Используется admin‑эндпоинтами после обновления config/users.json.
 */
export const reloadAuthUsersFromBlob = async () => {
  cachedUsers = null;
  await getAuthUsers();
};

export const findUserByCredentials = async (username, password) => {
  if (!username || !password) return null;
  const users = await getAuthUsers();
  const user = cachedUsers.find(
    (entry) => entry.username === username && entry.password === password
  );
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    allowedProfiles: user.profiles || [],
    roles: user.roles || []
  };
};

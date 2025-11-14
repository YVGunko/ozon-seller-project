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
      return {
        id: String(id),
        username: String(username),
        password: String(password),
        name: entry.name || username,
        profiles: Array.isArray(entry.profiles)
          ? entry.profiles.map((profileId) => String(profileId))
          : []
      };
    })
    .filter(Boolean);
};

const buildFallbackUsers = () => {
  const username = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASS;
  if (!username || !password) {
    return [];
  }
  const rawProfiles = process.env.ADMIN_PROFILES || '';
  const profiles = rawProfiles
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [
    {
      id: 'admin',
      username,
      password,
      name: 'Administrator',
      profiles
    }
  ];
};

const cachedUsers = (() => {
  const configured = normalizeUsers(parseJsonEnv(process.env.AUTH_USERS, []));
  if (configured.length > 0) {
    return configured;
  }
  return normalizeUsers(buildFallbackUsers());
})();

export const getAuthUsers = () => cachedUsers;

export const findUserByCredentials = (username, password) => {
  if (!username || !password) return null;
  const user = cachedUsers.find(
    (entry) => entry.username === username && entry.password === password
  );
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    allowedProfiles: user.profiles || []
  };
};


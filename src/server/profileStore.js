import { list } from '@vercel/blob';

const {
  OZON_PROFILES,
  OZON_CLIENT_ID,
  OZON_API_KEY,
  CONFIG_PROFILES_BLOB_PREFIX
} = process.env;

const PROFILES_BLOB_PREFIX = CONFIG_PROFILES_BLOB_PREFIX || 'config/profiles.json';

const parseJsonEnv = (value, fallback = []) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('[profileStore] Failed to parse JSON env', error);
    return fallback;
  }
};

const normalizeProfiles = (rawProfiles = []) => {
  if (!Array.isArray(rawProfiles)) return [];
  return rawProfiles
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = entry.id || entry.profile_id || `profile-${index + 1}`;
      const ozonClientId = entry.ozon_client_id || entry.client_id;
      const ozonApiKey = entry.ozon_api_key || entry.api_key;
      if (!ozonClientId || !ozonApiKey) return null;
      return {
        id: String(id),
        name: entry.name || `Профиль ${index + 1}`,
        ozon_client_id: String(ozonClientId),
        ozon_api_key: String(ozonApiKey),
        client_hint: entry.client_hint || String(ozonClientId).slice(0, 8),
        description: entry.description || ''
      };
    })
    .filter(Boolean);
};

const buildFallbackProfiles = () => {
  const clientId = OZON_CLIENT_ID;
  const apiKey = OZON_API_KEY;
  if (!clientId || !apiKey) {
    return [];
  }
  return [
    {
      id: 'default',
      name: 'Default profile',
      ozon_client_id: clientId,
      ozon_api_key: apiKey,
      client_hint: String(clientId).slice(0, 8),
      description: 'Fallback profile from environment variables'
    }
  ];
};

let cachedProfiles = null;

const loadProfilesFromEnv = () => {
  const configured = normalizeProfiles(parseJsonEnv(OZON_PROFILES, []));
  if (configured.length > 0) {
    console.log(
      '[profileStore] using OZON_PROFILES from env, profiles:',
      configured.length
    );
    return configured;
  }
  const fallback = normalizeProfiles(buildFallbackProfiles());
  if (fallback.length > 0) {
    console.log('[profileStore] using OZON_CLIENT_ID / OZON_API_KEY fallback profile');
  } else {
    console.warn('[profileStore] no profiles configured in env (OZON_PROFILES or OZON_*)');
  }
  return fallback;
};

async function loadProfilesFromBlob() {
  try {
    const { blobs } = await list({ prefix: PROFILES_BLOB_PREFIX });
    if (!blobs || blobs.length === 0) {
      console.log(
        '[profileStore] no profiles config blob found, prefix =',
        PROFILES_BLOB_PREFIX
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
        '[profileStore] profiles config blob is not an array, pathname =',
        blob.pathname
      );
      return null;
    }

    const normalized = normalizeProfiles(json);
    console.log(
      '[profileStore] loaded profiles from Blob',
      JSON.stringify({ count: normalized.length, pathname: blob.pathname })
    );
    return normalized;
  } catch (error) {
    console.error(
      '[profileStore] failed to load profiles from Blob, fallback to env',
      error
    );
    return null;
  }
}

export const ensureProfilesLoaded = async () => {
  if (cachedProfiles) return cachedProfiles;

  const fromBlob = await loadProfilesFromBlob();
  if (fromBlob && fromBlob.length > 0) {
    cachedProfiles = fromBlob;
    return cachedProfiles;
  }

  cachedProfiles = loadProfilesFromEnv();
  return cachedProfiles;
};

// Принудительно перезагрузить профили из Blob-конфига.
// Используется админскими API после изменения config/profiles.json.
export const reloadProfilesFromBlob = async () => {
  cachedProfiles = null;
  return ensureProfilesLoaded();
};

export const getAllProfiles = () => cachedProfiles || loadProfilesFromEnv();

export const getProfileById = (profileId) => {
  if (!profileId) return null;
  const source = cachedProfiles || loadProfilesFromEnv();
  return source.find((profile) => profile.id === profileId) || null;
};

export const getProfilesForUser = (allowedProfiles = []) => {
  const source = cachedProfiles || loadProfilesFromEnv();
  if (!Array.isArray(allowedProfiles) || allowedProfiles.length === 0) {
    return source;
  }
  const allowedSet = new Set(allowedProfiles.map(String));
  return source.filter((profile) => allowedSet.has(profile.id));
};

export const getProfileMetadataList = (allowedProfiles = []) =>
  getProfilesForUser(allowedProfiles).map((profile) => ({
    id: profile.id,
    name: profile.name,
    client_hint: profile.client_hint,
    description: profile.description || ''
  }));

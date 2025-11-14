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
  const clientId = process.env.OZON_CLIENT_ID;
  const apiKey = process.env.OZON_API_KEY;
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

const cachedProfiles = (() => {
  const configured = normalizeProfiles(parseJsonEnv(process.env.OZON_PROFILES, []));
  if (configured.length > 0) return configured;
  return normalizeProfiles(buildFallbackProfiles());
})();

export const getAllProfiles = () => cachedProfiles;

export const getProfileById = (profileId) => {
  if (!profileId) return null;
  return cachedProfiles.find((profile) => profile.id === profileId) || null;
};

export const getProfilesForUser = (allowedProfiles = []) => {
  if (!Array.isArray(allowedProfiles) || allowedProfiles.length === 0) {
    return cachedProfiles;
  }
  const allowedSet = new Set(allowedProfiles.map(String));
  return cachedProfiles.filter((profile) => allowedSet.has(profile.id));
};

export const getProfileMetadataList = (allowedProfiles = []) =>
  getProfilesForUser(allowedProfiles).map((profile) => ({
    id: profile.id,
    name: profile.name,
    client_hint: profile.client_hint,
    description: profile.description || ''
  }));

import { withServerContext } from '../../src/server/apiUtils';
import { configStorage } from '../../src/services/configStorage';

async function handler(req, res, ctx) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { auth } = ctx;

  if (!auth || !auth.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Основной источник профилей (магазинов) — Redis через config:sellers.
  let sellers = [];
  try {
    const raw = await configStorage.getSellers();
    if (Array.isArray(raw)) {
      sellers = raw;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/profiles] failed to load sellers from configStorage', e);
    sellers = [];
  }

  const allowedProfiles = Array.isArray(auth.user.allowedProfiles)
    ? auth.user.allowedProfiles.map((p) => String(p))
    : [];

  let visible = sellers;

  if (allowedProfiles.length > 0) {
    const allowedSet = new Set(allowedProfiles);
    visible = sellers.filter((s) => allowedSet.has(String(s.id)));
  }

  const profiles = visible.map((s) => {
    const ozonClientId =
      s.ozon_client_id != null
        ? s.ozon_client_id
        : s.ozonClientId != null
        ? s.ozonClientId
        : null;

    const clientHint =
      s.client_hint || (ozonClientId ? String(ozonClientId).slice(0, 8) : '');

    return {
      id: String(s.id),
      name: s.name || `Профиль ${s.id}`,
      client_hint: clientHint,
      description: s.description || ''
    };
  });

  return res.status(200).json({ profiles });
}

export default withServerContext(handler, { requireAuth: true });

// src/utils/attributesDraftStore.js
//
// Локальное хранение "черновиков" формы атрибутов в localStorage.
// Ключ: ozon-attrs-draft:${userId}:${profileId}:${offerId}

const DRAFT_VERSION = 1;

function getDraftKey(userId, profileId, offerId) {
  const safeUser = userId || 'anon';
  const safeProfile = profileId || 'no-profile';
  const safeOffer = offerId || 'no-offer';
  return `ozon-attrs-draft:${safeUser}:${safeProfile}:${safeOffer}`;
}

export function loadAttributesDraft({ userId, profileId, offerId }) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const key = getDraftKey(userId, profileId, offerId);
    const raw = window.localStorage.getItem(key);
    // eslint-disable-next-line no-console
    console.log('[draftStore] loadAttributesDraft', {
      key,
      hasValue: !!raw,
      userId,
      profileId,
      offerId
    });
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== DRAFT_VERSION) return null;
    // eslint-disable-next-line no-console
    console.log('[draftStore] parsed draft payload', {
      key,
      version: parsed.version,
      hasEditable: Array.isArray(parsed.editableAttributes),
      editableLength: Array.isArray(parsed.editableAttributes)
        ? parsed.editableAttributes.length
        : 0,
      updatedAt: parsed.updatedAt
    });
    return parsed;
  } catch {
    return null;
  }
}

export function saveAttributesDraft({ userId, profileId, offerId, editableAttributes }) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (!editableAttributes || !Array.isArray(editableAttributes)) return;
    const key = getDraftKey(userId, profileId, offerId);
    const payload = {
      version: DRAFT_VERSION,
      updatedAt: new Date().toISOString(),
      userId: userId || null,
      profileId: profileId || null,
      offerId: offerId || null,
      editableAttributes
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // глушим ошибки localStorage, чтобы не ломать форму
  }
}

export function clearAttributesDraft({ userId, profileId, offerId }) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = getDraftKey(userId, profileId, offerId);
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

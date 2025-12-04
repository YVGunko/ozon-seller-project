const STORAGE_KEY = 'currentProfileMeta';
const PROFILE_LISTENERS = new Set();

export class ProfileManager {
  /**
   * Получить текущий сохранённый профиль для указанного пользователя.
   * Если профиль принадлежит другому пользователю — вернёт null.
   *
   * @param {string|null} currentUserId
   * @returns {{ id: string, name: string, client_hint?: string, description?: string }|null}
   */
  static getCurrentProfile(currentUserId = null) {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') return null;

      // Новый формат: { userId, profile: { ... } }
      if (parsed.profile && parsed.userId !== undefined) {
        if (currentUserId && parsed.userId && parsed.userId !== currentUserId) {
          return null;
        }
        return parsed.profile;
      }

      // Старый формат: просто объект профиля { id, name, ... } без userId.
      return parsed;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[ProfileManager] Failed to read profile', error);
      return null;
    }
  }

  /**
   * Сохранить профиль для указанного пользователя.
   *
   * @param {Object|null} profile
   * @param {string|null} currentUserId
   */
  static setCurrentProfile(profile, currentUserId = null) {
    if (typeof window === 'undefined') return;
    try {
      if (profile) {
        const payload = {
          userId: currentUserId || null,
          profile: {
            id: profile.id,
            name: profile.name,
            client_hint: profile.client_hint || '',
            description: profile.description || ''
          }
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        ProfileManager._notifyChange(payload.profile);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
        ProfileManager._notifyChange(null);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[ProfileManager] Failed to persist profile', error);
    }
  }

  static clearProfile() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      ProfileManager._notifyChange(null);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[ProfileManager] Failed to clear profile', error);
    }
  }

  /**
   * Подписаться на изменения профиля.
   * Возвращает функцию отписки.
   *
   * @param {(profile: any) => void} listener
   * @returns {() => void}
   */
  static subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    PROFILE_LISTENERS.add(listener);
    return () => {
      PROFILE_LISTENERS.delete(listener);
    };
  }

  static _notifyChange(profile) {
    PROFILE_LISTENERS.forEach((listener) => {
      try {
        listener(profile);
      } catch (error) {
        console.error('[ProfileManager] listener error', error);
      }
    });
  }
}

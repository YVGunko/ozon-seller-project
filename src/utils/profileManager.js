const STORAGE_KEY = 'currentProfileMeta';

export class ProfileManager {
  static getCurrentProfile() {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('[ProfileManager] Failed to read profile', error);
      return null;
    }
  }

  static setCurrentProfile(profile) {
    if (typeof window === 'undefined') return;
    try {
      if (profile) {
        const payload = {
          id: profile.id,
          name: profile.name,
          client_hint: profile.client_hint || '',
          description: profile.description || ''
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('[ProfileManager] Failed to persist profile', error);
    }
  }

  static clearProfile() {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[ProfileManager] Failed to clear profile', error);
    }
  }
}

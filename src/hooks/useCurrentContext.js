// src/hooks/useCurrentContext.js
//
// Единый хук для получения текущего профиля (Seller-подобный объект),
// а также связанных доменных сущностей Enterprise / Seller / User.
//
// Пока источник правды по Seller — ProfileManager + next-auth session.
// По мере миграции можно будет заменить внутреннюю реализацию,
// не трогая все страницы, которые используют этот хук.

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ProfileManager } from '../utils/profileManager';
import {
  mapProfileToEnterpriseAndSeller,
  mapAuthToUser
} from '../domain/services/identityMapping';

export function useCurrentContext() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState(null);
  const [enterprise, setEnterprise] = useState(null);
  const [seller, setSeller] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const rawUserId = session?.user?.id || session?.user?.email || null;
    const allowedProfiles = Array.isArray(session?.user?.allowedProfiles)
      ? session.user.allowedProfiles.map((p) => String(p))
      : [];

    const sanitizeProfile = (storedProfile) => {
      if (!storedProfile) return null;
      const id = String(storedProfile.id);
      // Если список allowedProfiles пустой (root/admin или фолбэк) —
      // не режем профиль на клиенте.
      if (allowedProfiles.length === 0) return storedProfile;
      return allowedProfiles.includes(id) ? storedProfile : null;
    };

    const syncFromProfile = (storedProfile) => {
      const safeProfile = sanitizeProfile(storedProfile);

      if (!safeProfile && storedProfile) {
        // Профиль есть в localStorage, но не входит в allowedProfiles
        // текущего пользователя — очищаем кеш.
        ProfileManager.clearProfile();
      }

      setProfile(safeProfile || null);

      if (safeProfile) {
        const { enterprise: ent, seller: sel } =
          mapProfileToEnterpriseAndSeller(safeProfile);
        setEnterprise(ent);
        setSeller(sel);

        if (session?.user?.id || session?.user?.email) {
          const userId = session.user.id || session.user.email;
          const username = session.user.username || userId;
          const email = session.user.email || (username.includes('@') ? username : `${userId}@local`);
          const name = session.user.name || '';
          const roles = Array.isArray(session.user.roles)
            ? session.user.roles
            : [];
          const mappedUser = mapAuthToUser({
            userId,
            username,
            email,
            name,
            enterpriseId: ent.id,
            roles,
            sellerIds: [sel.id]
          });
          setUser(mappedUser);
        } else {
          setUser(null);
        }
      } else {
        setEnterprise(null);
        setSeller(null);
        setUser(null);
      }
    };

    const initialProfile = ProfileManager.getCurrentProfile(rawUserId);
    syncFromProfile(initialProfile);

    // Если профиль не сохранён или невалиден, а профили доступны —
    // пытаемся автоматически выбрать первый доступный профиль
    // на основе данных /api/profiles (чтобы получить корректное name/client_hint).
    if (!initialProfile && allowedProfiles.length > 0) {
      const allowedSet = new Set(allowedProfiles);
      (async () => {
        try {
          const res = await fetch('/api/profiles');
          if (!res.ok) return;
          const data = await res.json();
          const list = Array.isArray(data?.profiles) ? data.profiles : [];
          const candidate =
            list.find((p) => allowedSet.has(String(p.id))) || null;
          if (candidate) {
            ProfileManager.setCurrentProfile(candidate, rawUserId);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(
            '[useCurrentContext] failed to autoselect profile from /api/profiles',
            e
          );
        }
      })();
    }

    const unsubscribe = ProfileManager.subscribe((nextProfile) => {
      syncFromProfile(nextProfile);
    });

    return () => {
      unsubscribe();
    };
  }, [session]);

  return {
    profile,
    enterprise,
    seller,
    user
  };
}

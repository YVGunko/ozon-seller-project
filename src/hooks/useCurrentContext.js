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
import { mapProfileToEnterpriseAndSeller, mapAuthToUser } from '../domain/services/identityMapping';

export function useCurrentContext() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState(null);
  const [enterprise, setEnterprise] = useState(null);
  const [seller, setSeller] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const syncFromProfile = (storedProfile) => {
      setProfile(storedProfile || null);

      if (storedProfile) {
        const { enterprise: ent, seller: sel } = mapProfileToEnterpriseAndSeller(storedProfile);
        setEnterprise(ent);
        setSeller(sel);

        if (session?.user?.id || session?.user?.email) {
          const userId = session.user.id || session.user.email;
          const email = session.user.email || `${userId}@local`;
          const name = session.user.name || '';
          const mappedUser = mapAuthToUser({
            userId,
            email,
            name,
            enterpriseId: ent.id,
            roles: [], // роли будем настраивать позже
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

    const initialProfile = ProfileManager.getCurrentProfile();
    syncFromProfile(initialProfile);

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

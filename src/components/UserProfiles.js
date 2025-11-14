import { useEffect, useState } from 'react';
import { ProfileManager } from '../utils/profileManager';

export default function UserProfiles({ onProfileChange }) {
  const [profiles, setProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const stored = ProfileManager.getCurrentProfile();
    if (stored) {
      setCurrentProfile(stored);
    }
    fetchProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/profiles');
      if (!response.ok) {
        throw new Error('Не удалось загрузить профили');
      }
      const data = await response.json();
      const loadedProfiles = data?.profiles || [];
      setProfiles(loadedProfiles);

      const storedProfile = ProfileManager.getCurrentProfile();
      if (storedProfile) {
        const exists = loadedProfiles.some((profile) => profile.id === storedProfile.id);
        if (!exists) {
          ProfileManager.clearProfile();
          setCurrentProfile(null);
          if (onProfileChange) {
            onProfileChange(null);
          }
        }
      }
    } catch (fetchError) {
      setError(fetchError.message || 'Ошибка загрузки профилей');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = (profile) => {
    ProfileManager.setCurrentProfile(profile);
    setCurrentProfile(profile);
    if (onProfileChange) {
      onProfileChange(profile);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 15 }}>
        <div style={{ fontSize: 14, color: '#6c757d' }}>
          Список профилей управляется администратором. Изменения делаютcя через переменные окружения.
        </div>
      </div>

      {loading && <div style={{ color: '#6c757d' }}>Загружаем доступные профили…</div>}
      {error && <div style={{ color: '#dc3545' }}>{error}</div>}

      {!loading && !profiles.length && !error && (
        <div style={{ color: '#6c757d' }}>Профили не настроены. Обратитесь к администратору.</div>
      )}

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {profiles.map((profile) => {
          const isActive = currentProfile?.id === profile.id;
          return (
            <div
              key={profile.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                padding: '12px',
                backgroundColor: isActive ? '#e3f2fd' : '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontWeight: 'bold' }}>{profile.name}</div>
                <div style={{ fontSize: 12, color: '#6c757d' }}>
                  Client ID: {profile.client_hint || '—'}
                </div>
                {profile.description && (
                  <div style={{ fontSize: 12, color: '#6c757d' }}>{profile.description}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleSwitch(profile)}
                disabled={isActive}
                style={{
                  padding: '6px 12px',
                  backgroundColor: isActive ? '#6c757d' : '#0070f3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: isActive ? 'default' : 'pointer'
                }}
              >
                {isActive ? 'Активен' : 'Выбрать'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

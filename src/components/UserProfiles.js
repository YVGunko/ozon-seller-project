import { useState, useEffect } from 'react';
import { ProfileManager } from '../utils/profileManager';

export default function UserProfiles({ onProfileChange }) {
  const [profiles, setProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = () => {
    const savedProfiles = ProfileManager.getProfiles();
    const current = ProfileManager.getCurrentProfile();
    setProfiles(savedProfiles);
    setCurrentProfile(current);
  };

  const addProfile = (profile) => {
    const newProfile = { ...profile, id: Date.now(), createdAt: new Date().toISOString() };
    const newProfiles = [...profiles, newProfile];
    
    ProfileManager.saveProfiles(newProfiles);
    setProfiles(newProfiles);
    
    // Автоматически выбираем новый профиль
    switchProfile(newProfile);
  };

  const switchProfile = (profile) => {
    ProfileManager.setCurrentProfile(profile);
    setCurrentProfile(profile);
    
    if (onProfileChange) {
      onProfileChange(profile);
    }
    
    // Показываем уведомление
    alert(`Профиль "${profile.name}" активирован`);
  };

  const deleteProfile = (profileId) => {
    const newProfiles = profiles.filter(p => p.id !== profileId);
    ProfileManager.saveProfiles(newProfiles);
    setProfiles(newProfiles);
    
    // Если удалили текущий профиль, сбрасываем выбор
    if (currentProfile && currentProfile.id === profileId) {
      ProfileManager.setCurrentProfile(null);
      setCurrentProfile(null);
      if (onProfileChange) onProfileChange(null);
    }
  };

  return (
    <div>
      {/* Убрали заголовок, так как он теперь в модальном окне */}
      
      <ProfileForm onAdd={addProfile} />
      
      {/* Экспорт/Импорт */}
      <div style={{ margin: '15px 0', display: 'flex', gap: '10px' }}>
        <button
          onClick={ProfileManager.exportProfiles}
          style={{
            padding: '8px 15px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          📤 Экспорт профилей
        </button>
        
        <label style={{
          padding: '8px 15px',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          📥 Импорт профилей
          <input
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (file) {
                try {
                  await ProfileManager.importProfiles(file);
                  loadProfiles();
                  alert('Профили успешно импортированы!');
                } catch (error) {
                  alert('Ошибка импорта: ' + error.message);
                }
              }
            }}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Список профилей */}
      <div style={{ marginTop: '15px' }}>
        <h4>Доступные профили:</h4>
        {profiles.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>Нет добавленных профилей</p>
        ) : (
          profiles.map(profile => (
            <ProfileItem
              key={profile.id}
              profile={profile}
              isActive={currentProfile?.id === profile.id}
              onSwitch={switchProfile}
              onDelete={deleteProfile}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProfileForm({ onAdd }) {
  const [form, setForm] = useState({
    name: '',
    ozon_client_id: '',
    ozon_api_key: ''
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (form.name && form.ozon_client_id && form.ozon_api_key) {
      onAdd(form)
      setForm({ name: '', ozon_client_id: '', ozon_api_key: '' })
    } else {
      alert('Пожалуйста, заполните все поля')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '10px' }}>
      <input
        type="text"
        placeholder="Название профиля"
        value={form.name}
        onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
        style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        required
      />
      <input
        type="text"
        placeholder="OZON Client ID"
        value={form.ozon_client_id}
        onChange={(e) => setForm(prev => ({ ...prev, ozon_client_id: e.target.value }))}
        style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        required
      />
      <input
        type="password"
        placeholder="OZON API Key"
        value={form.ozon_api_key}
        onChange={(e) => setForm(prev => ({ ...prev, ozon_api_key: e.target.value }))}
        style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
        required
      />
      <button 
        type="submit"
        style={{
          padding: '10px',
          backgroundColor: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Добавить профиль
      </button>
    </form>
  )
}

function ProfileItem({ profile, isActive, onSwitch, onDelete }) {
  return (
    <div style={{ 
      padding: '10px', 
      border: '1px solid #eee', 
      margin: '5px 0',
      backgroundColor: isActive ? '#e3f2fd' : 'white',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ flex: 1 }}>
        <strong>{profile.name}</strong>
        <div style={{ fontSize: '12px', color: '#666' }}>
          Client ID: {profile.ozon_client_id?.slice(0, 10)}...
          {profile.createdAt && (
            <span style={{ marginLeft: '10px' }}>
              Создан: {new Date(profile.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onSwitch(profile)}
          disabled={isActive}
          style={{
            padding: '5px 10px',
            backgroundColor: isActive ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isActive ? 'default' : 'pointer',
            fontSize: '12px'
          }}
        >
          {isActive ? 'Активен' : 'Выбрать'}
        </button>
        
        <button
          onClick={() => {
            if (confirm(`Удалить профиль "${profile.name}"?`)) {
              onDelete(profile.id);
            }
          }}
          style={{
            padding: '5px 10px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Удалить
        </button>
      </div>
    </div>
  );
}
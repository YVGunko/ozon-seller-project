import { useEffect, useState } from 'react';
import Link from 'next/link';

const ALL_ROLES = ['admin', 'manager', 'content-creator', 'finance', 'order'];

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [editingPassword, setEditingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const [usersRes, profilesRes] = await Promise.all([
          fetch('/api/admin/users'),
          fetch('/api/profiles')
        ]);

        const usersData = await usersRes.json();
        const profilesData = await profilesRes.json();

        if (!usersRes.ok) {
          throw new Error(usersData?.error || 'Не удалось загрузить пользователей');
        }
        if (!profilesRes.ok) {
          throw new Error(profilesData?.error || 'Не удалось загрузить профили');
        }

        if (!cancelled) {
          const items = Array.isArray(usersData.items) ? usersData.items : [];
          const profs = Array.isArray(profilesData.profiles) ? profilesData.profiles : [];
          setUsers(items);
          setProfiles(profs);
          if (items.length) {
            const first = items[0];
            setSelectedId(first.id);
            setForm({
              ...first,
              password: ''
            });
            setEditingPassword(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Не удалось загрузить данные');
          setUsers([]);
          setProfiles([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (user) => {
    setSelectedId(user.id);
    setForm({
      ...user,
      password: ''
    });
    setEditingPassword(false);
  };

  const handleCreate = () => {
    setSelectedId(null);
    setForm({
      id: '',
      username: '',
      name: '',
      email: '',
      roles: [],
      profiles: [],
      hasPassword: false,
      password: ''
    });
    setEditingPassword(true);
  };

  const handleFieldChange = (field, value) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleRoleToggle = (role) => {
    setForm((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev.roles) ? prev.roles : [];
      const has = current.includes(role);
      return {
        ...prev,
        roles: has ? current.filter((r) => r !== role) : [...current, role]
      };
    });
  };

  const handleProfileToggle = (profileId) => {
    setForm((prev) => {
      if (!prev) return prev;
      const current = Array.isArray(prev.profiles) ? prev.profiles.map(String) : [];
      const id = String(profileId);
      const has = current.includes(id);
      return {
        ...prev,
        profiles: has ? current.filter((p) => p !== id) : [...current, id]
      };
    });
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        id: form.id || undefined,
        username: form.username,
        name: form.name,
        email: form.email,
        // пароль отправляем только если его реально ввели
        password: form.password && form.password.trim() ? form.password : undefined,
        roles: form.roles || [],
        profiles: form.profiles || []
      };

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось сохранить пользователя');
      }
      const updated = data.user;
      setUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === updated.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated];
      });
      setSelectedId(updated.id);
      setForm({
        ...updated,
        password: ''
      });
      setEditingPassword(false);
    } catch (err) {
      setError(err.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="oz-page">
      <div className="oz-page-header">
        <div className="oz-breadcrumb">
          <Link href="/">
            <span className="oz-breadcrumb-link">Главная</span>
          </Link>
          <span className="oz-breadcrumb-separator">/</span>
          <span className="oz-breadcrumb-current">Пользователи</span>
        </div>
        <div className="oz-page-title-block">
          <h1 className="oz-page-title">Пользователи и роли</h1>
          <p className="oz-page-subtitle">
            Управление пользователями внутри текущей организации
          </p>
        </div>
      </div>

      <div className="oz-main">
        <div className="oz-card">
          <div className="oz-card-header">
            <h2 className="oz-card-title">Пользователи</h2>
            <span className="oz-card-subtitle">
              Данные берутся из конфигурации авторизации (config/users.json).
            </span>
          </div>
          <div className="oz-card-body">
            {loading && <div>Загрузка пользователей…</div>}
            {error && (
              <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>
            )}

            {!loading && !error && (
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start',
                  flexWrap: 'wrap'
                }}
              >
                <div
                  style={{
                    minWidth: 260,
                    maxWidth: 320,
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 12,
                    background: '#f9fafb'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 8
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Список</div>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={saving}
                      style={{
                        marginLeft: 'auto',
                        padding: '4px 10px',
                        borderRadius: 9999,
                        border: 'none',
                        backgroundColor: saving ? '#9ca3af' : '#16a34a',
                        color: '#fff',
                        fontSize: 12,
                        cursor: saving ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Новый пользователь
                    </button>
                  </div>
                  {users.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      Пользователи не найдены
                    </div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {users.map((u) => (
                        <li
                          key={u.id}
                          onClick={() => handleSelect(u)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 8,
                            marginBottom: 4,
                            cursor: 'pointer',
                            backgroundColor:
                              selectedId === u.id ? '#e5f3ff' : 'transparent',
                            border:
                              selectedId === u.id
                                ? '1px solid #3b82f6'
                                : '1px solid transparent',
                            fontSize: 12
                          }}
                        >
                          <div style={{ fontWeight: 500 }}>
                            {u.name || u.username || u.id}
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {u.username}
                          </div>
                          <div style={{ fontSize: 10, color: '#9ca3af' }}>
                            Роли:{' '}
                            {Array.isArray(u.roles) && u.roles.length
                              ? u.roles.join(', ')
                              : '—'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {form && (
                  <div
                    style={{
                      flex: 1,
                      minWidth: 320,
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: 16
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                      {form.id ? `Редактирование пользователя ${form.id}` : 'Новый пользователь'}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <label style={{ fontSize: 13 }}>
                        Username (логин)
                        <input
                          type="text"
                          value={form.username || ''}
                          onChange={(e) => handleFieldChange('username', e.target.value)}
                          style={{
                            marginTop: 4,
                            width: '100%',
                            padding: '6px 8px',
                            fontSize: 13,
                            borderRadius: 6,
                            border: '1px solid #d1d5db'
                          }}
                        />
                      </label>

                      <label style={{ fontSize: 13 }}>
                        Имя
                        <input
                          type="text"
                          value={form.name || ''}
                          onChange={(e) => handleFieldChange('name', e.target.value)}
                          style={{
                            marginTop: 4,
                            width: '100%',
                            padding: '6px 8px',
                            fontSize: 13,
                            borderRadius: 6,
                            border: '1px solid #d1d5db'
                          }}
                        />
                      </label>

                      <label style={{ fontSize: 13 }}>
                        Email
                        <input
                          type="email"
                          value={form.email || ''}
                          onChange={(e) => handleFieldChange('email', e.target.value)}
                          style={{
                            marginTop: 4,
                            width: '100%',
                            padding: '6px 8px',
                            fontSize: 13,
                            borderRadius: 6,
                            border: '1px solid #d1d5db'
                          }}
                        />
                      </label>

                      <label style={{ fontSize: 13 }}>
                        Пароль
                        {form.id && form.hasPassword && !editingPassword ? (
                          <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                            <input
                              type="text"
                              value="*****"
                              disabled
                              style={{
                                flex: 1,
                                padding: '6px 8px',
                                fontSize: 13,
                                borderRadius: 6,
                                border: '1px solid #d1d5db',
                                backgroundColor: '#f9fafb',
                                color: '#6b7280'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPassword(true);
                                handleFieldChange('password', '');
                              }}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 9999,
                                border: 'none',
                                backgroundColor: '#f97316',
                                color: '#fff',
                                fontSize: 12,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              Изменить пароль
                            </button>
                          </div>
                        ) : (
                          <input
                            type="password"
                            value={form.password || ''}
                            onChange={(e) => handleFieldChange('password', e.target.value)}
                            style={{
                              marginTop: 4,
                              width: '100%',
                              padding: '6px 8px',
                              fontSize: 13,
                              borderRadius: 6,
                              border: '1px solid #d1d5db'
                            }}
                          />
                        )}
                      </label>

                      <div style={{ fontSize: 13 }}>
                        Роли
                        <div
                          style={{
                            marginTop: 4,
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8
                          }}
                        >
                          {ALL_ROLES.map((role) => {
                            const checked =
                              Array.isArray(form.roles) && form.roles.includes(role);
                            return (
                              <label
                                key={role}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 12,
                                  padding: '2px 6px',
                                  borderRadius: 9999,
                                  border: '1px solid #d1d5db',
                                  backgroundColor: checked ? '#e5f3ff' : '#f9fafb'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleRoleToggle(role)}
                                />
                                <span>{role}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ fontSize: 13 }}>
                        Профили OZON
                        <div
                          style={{
                            marginTop: 4,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            maxHeight: 180,
                            overflowY: 'auto',
                            border: '1px solid #e5e7eb',
                            borderRadius: 8,
                            padding: 6
                          }}
                        >
                          {profiles.length === 0 ? (
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                              Профили не найдены
                            </div>
                          ) : (
                            profiles.map((p) => {
                              const id = String(p.id);
                              const checked =
                                Array.isArray(form.profiles) &&
                                form.profiles.map(String).includes(id);
                              return (
                                <label
                                  key={id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: 12
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleProfileToggle(id)}
                                  />
                                  <span>
                                    {p.name} ({id})
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
                          Если не выбрать ни одного профиля, будут использоваться
                          настройки по умолчанию (как в AUTH_USERS).
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 9999,
                          border: 'none',
                          backgroundColor: saving ? '#6b7280' : '#2563eb',
                          color: '#fff',
                          fontSize: 13,
                          cursor: saving ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {saving ? 'Сохранение…' : 'Сохранить'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

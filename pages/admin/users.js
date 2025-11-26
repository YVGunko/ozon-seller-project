import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadUsers = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Не удалось загрузить пользователей');
        }
        if (!cancelled) {
          setItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Не удалось загрузить пользователей');
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadUsers();

    return () => {
      cancelled = true;
    };
  }, []);

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
            Справочный список пользователей текущего аккаунта
          </p>
        </div>
      </div>

      <div className="oz-main">
        <div className="oz-card">
          <div className="oz-card-header">
            <h2 className="oz-card-title">Пользователи</h2>
            <span className="oz-card-subtitle">
              Данные берутся из конфигурации авторизации (AUTH_USERS / ADMIN_*).
            </span>
          </div>
          <div className="oz-card-body">
            {loading && <div>Загрузка пользователей…</div>}
            {error && (
              <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>
            )}
            {!loading && !error && items.length === 0 && (
              <div>Пользователи не найдены.</div>
            )}
            {!loading && !error && items.length > 0 && (
              <div
                style={{
                  overflowX: 'auto'
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13
                  }}
                >
                  <thead>
                    <tr>
                      <th style={cellHeaderStyle}>ID</th>
                      <th style={cellHeaderStyle}>Имя</th>
                      <th style={cellHeaderStyle}>Username</th>
                      <th style={cellHeaderStyle}>Email</th>
                      <th style={cellHeaderStyle}>Роли</th>
                      <th style={cellHeaderStyle}>Профили OZON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((user) => (
                      <tr key={user.id}>
                        <td style={cellBodyStyle}>{user.id}</td>
                        <td style={cellBodyStyle}>{user.name}</td>
                        <td style={cellBodyStyle}>{user.username}</td>
                        <td style={cellBodyStyle}>{user.email || '—'}</td>
                        <td style={cellBodyStyle}>
                          {Array.isArray(user.roles) && user.roles.length
                            ? user.roles.join(', ')
                            : '—'}
                        </td>
                        <td style={cellBodyStyle}>
                          {Array.isArray(user.allowedProfiles) &&
                          user.allowedProfiles.length
                            ? user.allowedProfiles.join(', ')
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const cellHeaderStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid #e5e7eb',
  fontWeight: 600,
  fontSize: 12,
  color: '#6b7280'
};

const cellBodyStyle = {
  padding: '8px 10px',
  borderBottom: '1px solid #f3f4f6',
  fontSize: 13
};


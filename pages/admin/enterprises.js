import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminEnterprisesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadEnterprises = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/admin/enterprises');
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Не удалось загрузить организации');
        }
        if (!cancelled) {
          setItems(Array.isArray(data.items) ? data.items : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Не удалось загрузить организации');
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadEnterprises();

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
          <span className="oz-breadcrumb-current">Организации</span>
        </div>
        <div className="oz-page-title-block">
          <h1 className="oz-page-title">Enterprise / организации</h1>
          <p className="oz-page-subtitle">
            Справочный список Enterprise из конфигурации (config/enterprises.json).
          </p>
        </div>
      </div>

      <div className="oz-main">
        <div className="oz-card">
          <div className="oz-card-header">
            <h2 className="oz-card-title">Список Enterprise</h2>
            <span className="oz-card-subtitle">
              Пока только просмотр. Редактирование выполняется через JSON‑конфиг/Blob.
            </span>
          </div>
          <div className="oz-card-body">
            {loading && <div>Загрузка организаций…</div>}
            {error && (
              <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>
            )}
            {!loading && !error && items.length === 0 && (
              <div>Организации не найдены.</div>
            )}
            {!loading && !error && items.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
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
                      <th style={cellHeaderStyle}>Название</th>
                      <th style={cellHeaderStyle}>Slug</th>
                      <th style={cellHeaderStyle}>AI‑настройки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ent) => {
                      const ai = (ent.settings && ent.settings.ai) || {};
                      const textFlag = ai.textEnabled === false ? 'выкл' : 'вкл';
                      const imageFlag = ai.imageEnabled === false ? 'выкл' : 'вкл';
                      return (
                        <tr key={ent.id}>
                          <td style={cellBodyStyle}>{ent.id}</td>
                          <td style={cellBodyStyle}>{ent.name}</td>
                          <td style={cellBodyStyle}>{ent.slug || '—'}</td>
                          <td style={cellBodyStyle}>
                            Текст: {textFlag}, Картинки: {imageFlag}
                          </td>
                        </tr>
                      );
                    })}
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


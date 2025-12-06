import { useRouter } from 'next/router';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccess } from '../../src/hooks/useAccess';

export default function JobDetailsPage() {
  const router = useRouter();
  const { id } = router.query;
  const { canManageProducts } = useAccess();

  const [job, setJob] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !canManageProducts) return;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/items`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Не удалось загрузить детали задачи');
        }
        setJob(data.job || null);
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        setError(err.message || 'Ошибка загрузки деталей задачи');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, canManageProducts]);

  const title = job ? `Задача ${job.id}` : 'Детали задачи';

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/" legacyBehavior>
          <a style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14 }}>← На главную</a>
        </Link>
        <span style={{ margin: '0 8px', color: '#9ca3af' }}>/</span>
        <Link href="/products" legacyBehavior>
          <a style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14 }}>Товары</a>
        </Link>
        <span style={{ margin: '0 8px', color: '#9ca3af' }}>/</span>
        <span style={{ fontSize: 14, color: '#111827' }}>Детали задачи</span>
      </div>

      <h1 style={{ marginBottom: 8 }}>{title}</h1>

      {job && (
        <p style={{ color: '#6b7280', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Тип: <strong>{job.type}</strong> · Статус:{' '}
          <strong>{job.status}</strong> · Всего: <strong>{job.totalItems}</strong> ·
          Обработано: <strong>{job.processedItems}</strong> · Ошибок:{' '}
          <strong>{job.failedItems}</strong>
        </p>
      )}

      {loading && <div style={{ color: '#0d6efd', marginBottom: 12 }}>Загрузка…</div>}
      {error && (
        <div
          style={{
            marginBottom: 12,
            color: '#b91c1c',
            backgroundColor: '#fee2e2',
            padding: 10,
            borderRadius: 6,
            fontSize: 13
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Элементы задачи отсутствуют.</div>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: 700,
              fontSize: 12
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6' }}>
                <th style={{ padding: 6, border: '1px solid #e5e7eb', textAlign: 'left' }}>
                  Item ID
                </th>
                <th style={{ padding: 6, border: '1px solid #e5e7eb', textAlign: 'left' }}>
                  Offer ID
                </th>
                <th style={{ padding: 6, border: '1px solid #e5e7eb', textAlign: 'left' }}>
                  Статус
                </th>
                <th style={{ padding: 6, border: '1px solid #e5e7eb', textAlign: 'left' }}>
                  Попытки
                </th>
                <th style={{ padding: 6, border: '1px solid #e5e7eb', textAlign: 'left' }}>
                  Последняя ошибка
                </th>
                <th style={{ padding: 6, border: '1px solid #e5e7eb', textAlign: 'left' }}>
                  Создан
                </th>
                <th style={{ padding: 6, border: '1px solid #e5e7eb', textAlign: 'left' }}>
                  Начат
                </th>
                <th style={{ padding: 6, border: '1px solid #e5e7eb', textAlign: 'left' }}>
                  Завершён
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const createdAt = item.createdAt ? new Date(item.createdAt) : null;
                const startedAt = item.startedAt ? new Date(item.startedAt) : null;
                const finishedAt = item.finishedAt ? new Date(item.finishedAt) : null;

                return (
                  <tr key={item.id}>
                    <td
                      style={{
                        padding: 6,
                        border: '1px solid #e5e7eb',
                        fontFamily: 'monospace'
                      }}
                    >
                      {item.id}
                    </td>
                    <td style={{ padding: 6, border: '1px solid #e5e7eb' }}>
                      {item.offerId}
                    </td>
                    <td style={{ padding: 6, border: '1px solid #e5e7eb' }}>{item.status}</td>
                    <td style={{ padding: 6, border: '1px solid #e5e7eb' }}>
                      {item.attempts}
                    </td>
                    <td
                      style={{
                        padding: 6,
                        border: '1px solid #e5e7eb',
                        color: item.lastError ? '#b91c1c' : '#6b7280'
                      }}
                    >
                      {item.lastError || '—'}
                    </td>
                    <td style={{ padding: 6, border: '1px solid #e5e7eb' }}>
                      {createdAt && !Number.isNaN(createdAt.getTime())
                        ? createdAt.toLocaleString('ru-RU')
                        : '—'}
                    </td>
                    <td style={{ padding: 6, border: '1px solid #e5e7eb' }}>
                      {startedAt && !Number.isNaN(startedAt.getTime())
                        ? startedAt.toLocaleString('ru-RU')
                        : '—'}
                    </td>
                    <td style={{ padding: 6, border: '1px solid #e5e7eb' }}>
                      {finishedAt && !Number.isNaN(finishedAt.getTime())
                        ? finishedAt.toLocaleString('ru-RU')
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


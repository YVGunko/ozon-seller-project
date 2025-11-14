import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function LogsPage() {
  const { data: session, status } = useSession();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/logs');
        if (!response.ok) {
          throw new Error('Не удалось загрузить логи');
        }
        const data = await response.json();
        setLogs(data.logs || []);
      } catch (err) {
        setError(err.message || 'Ошибка загрузки логов');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [status]);

  const handleLogOfferClick = (offerId) => {
    if (!offerId) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('openAttributesOffer', offerId);
      window.location.href = `/products?offer_id=${encodeURIComponent(offerId)}&openAttributes=true`;
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" passHref>
          <div style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14, cursor: 'pointer' }}>
            ← На главную
          </div>
        </Link>
      </div>

      <h1>Логи импорта в OZON</h1>
      <p style={{ color: '#6c757d', fontSize: '13px' }}>
        Здесь отображаются последние записи о запросах, связанных с импортом товаров и обновлением атрибутов.
      </p>

      {loading && <div style={{ padding: '10px 0', color: '#0070f3' }}>Загрузка логов…</div>}
      {error && (
        <div style={{ padding: '10px 0', color: '#dc3545' }}>
          Ошибка: {error}
        </div>
      )}

      {!loading && !logs.length && !error && (
        <div style={{ padding: '10px 0', color: '#6c757d' }}>Логи отсутствуют.</div>
      )}

      {logs.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f3f5' }}>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Offer ID</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Product ID</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Endpoint</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Method</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Status</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Duration (ms)</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Error</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>User</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Task ID</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Status message</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Barcode</th>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Barcode error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr key={`${log.timestamp}-${index}`} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                  <td style={{ padding: 8, border: '1px solid #dee2e6' }}>
                    {log.offer_id ? (
                      <button
                        type="button"
                        onClick={() => handleLogOfferClick(log.offer_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#0070f3',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        {log.offer_id}
                      </button>
                    ) : (
                      <span style={{ color: '#6c757d' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6' }}>{log.product_id || '—'}</td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6', fontFamily: 'monospace' }}>{log.endpoint || '—'}</td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6' }}>{log.method || '—'}</td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6', color: log.status >= 400 ? '#dc3545' : '#28a745' }}>
                    {log.status ?? '—'}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6' }}>
                    {typeof log.duration_ms === 'number' ? log.duration_ms : '—'}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6', color: '#dc3545' }}>
                    {log.error_message || '—'}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6' }}>{log.user_id || '—'}</td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6' }}>{log.task_id || '—'}</td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6', fontSize: 12, color: '#495057' }}>
                    {log.import_message || '—'}
                  </td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6' }}>{log.barcode || '—'}</td>
                  <td style={{ padding: 8, border: '1px solid #dee2e6', color: '#dc3545' }}>{log.barcode_error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAccess } from '../src/hooks/useAccess';

const PAGE_LIMIT = 50;

export default function LogsPage() {
  const { user, canViewLogs } = useAccess();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ offerId: '', dateFrom: '', dateTo: '' });
  const [formFilters, setFormFilters] = useState({ offerId: '', dateFrom: '', dateTo: '' });
  const [nextCursor, setNextCursor] = useState(null);
  const [total, setTotal] = useState(0);

  const fetchLogs = useCallback(
    async ({ cursor = 0, append = false, silent = false } = {}) => {
      if (!user || !canViewLogs) return;
      if (append) {
        setLoadingMore(true);
      } else if (!silent) {
        setLoading(true);
      }
      if (!append && !silent) {
        setError(null);
      }
      try {
        const params = new URLSearchParams();
        params.set('limit', PAGE_LIMIT);
        if (cursor) params.set('cursor', cursor);
        if (filters.offerId) params.set('offer_id', filters.offerId);
        if (filters.dateFrom) params.set('date_from', filters.dateFrom);
        if (filters.dateTo) params.set('date_to', filters.dateTo);

        const response = await fetch(`/api/logs?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Не удалось загрузить логи');
        }
        const data = await response.json();
        const entries = data.logs || [];
        setLogs((prev) => (append ? [...prev, ...entries] : entries));
        setNextCursor(data.nextCursor ?? null);
        setTotal(data.total ?? entries.length);
      } catch (err) {
        if (!append) {
          setLogs([]);
        }
        setError(err.message || 'Ошибка загрузки логов');
      } finally {
        if (append) {
          setLoadingMore(false);
        } else if (!silent) {
          setLoading(false);
        }
      }
    },
    [user, canViewLogs, filters.offerId, filters.dateFrom, filters.dateTo]
  );

  useEffect(() => {
    if (!user || !canViewLogs) return;
    fetchLogs({ cursor: 0 });
  }, [user, canViewLogs, fetchLogs]);

  const handleFilterInputChange = (field, value) => {
    setFormFilters((prev) => ({ ...prev, [field]: value }));
  };

  const applyFilterChanges = () => {
    setFilters({ ...formFilters });
  };

  const resetFilters = () => {
    const reset = { offerId: '', dateFrom: '', dateTo: '' };
    setFormFilters(reset);
    setFilters(reset);
  };

  const handleRefresh = () => {
    fetchLogs({ cursor: 0 });
  };

  const handleLoadMore = () => {
    if (nextCursor === null || loadingMore) return;
    fetchLogs({ cursor: nextCursor, append: true });
  };

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

      {user && canViewLogs && (
        <div
        style={{
          backgroundColor: '#f8f9fa',
          padding: 16,
          borderRadius: 8,
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>
            Артикул (offer_id)
          </label>
          <input
            type="text"
            value={formFilters.offerId}
            onChange={(e) => handleFilterInputChange('offerId', e.target.value)}
            placeholder="Например, Viper"
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>
            Дата от
          </label>
          <input
            type="date"
            value={formFilters.dateFrom}
            onChange={(e) => handleFilterInputChange('dateFrom', e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>
            Дата до
          </label>
          <input
            type="date"
            value={formFilters.dateTo}
            onChange={(e) => handleFilterInputChange('dateTo', e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button
            type="button"
            onClick={applyFilterChanges}
            style={{
              padding: '8px 16px',
              backgroundColor: '#198754',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Применить
          </button>
          <button
            type="button"
            onClick={resetFilters}
            style={{
              padding: '8px 16px',
              backgroundColor: '#e5e7eb',
              color: '#111827',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0d6efd',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            Обновить
          </button>
        </div>
        </div>
      )}

      {!canViewLogs && (
        <div style={{ padding: '10px 0', color: '#b91c1c', fontSize: 13 }}>
          У вас нет прав на просмотр логов импорта.
        </div>
      )}

      {loading && <div style={{ padding: '10px 0', color: '#0070f3' }}>Загрузка логов…</div>}
      {error && (
        <div style={{ padding: '10px 0', color: '#dc3545' }}>
          Ошибка: {error}
        </div>
      )}

      {!loading && !logs.length && !error && (
        <div style={{ padding: '10px 0', color: '#6c757d' }}>Логи отсутствуют.</div>
      )}

      {!loading && logs.length > 0 && (
        <div style={{ marginBottom: 10, color: '#6c757d', fontSize: 13 }}>
          Показано: {logs.length} из {total} записей
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f3f5' }}>
                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Дата / время</th>
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
              {logs.map((log, index) => {
                const timestamp = log.timestamp ? new Date(log.timestamp) : null;
                const timestampLabel = timestamp && !Number.isNaN(timestamp.getTime())
                  ? timestamp.toLocaleString('ru-RU')
                  : '—';
                return (
                  <tr key={`${log.timestamp}-${index}`} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                    <td style={{ padding: 8, border: '1px solid #dee2e6' }}>{timestampLabel}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor !== null && logs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              padding: '10px 20px',
              backgroundColor: '#20c997',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: loadingMore ? 'not-allowed' : 'pointer'
            }}
          >
            {loadingMore ? 'Загрузка…' : 'Загрузить ещё'}
          </button>
        </div>
      )}
    </div>
  );
}

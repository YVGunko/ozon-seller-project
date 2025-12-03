import { useState } from 'react';
import Link from 'next/link';
import { useCurrentContext } from '../src/hooks/useCurrentContext';

const defaultWithOptions = {
  analytics_data: true,
  barcodes: true,
  financial_data: false,
  legal_info: false,
  translit: false
};

const formatDateTimeInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toIsoString = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString();
};

export default function PostingsPage() {
  const { profile: currentProfile } = useCurrentContext();
  const [filterMode, setFilterMode] = useState('cutoff');
  const [form, setForm] = useState({
    dir: 'desc',
    limit: 50,
    cutoff_from: '',
    cutoff_to: '',
    delivering_date_from: '',
    delivering_date_to: '',
    with: defaultWithOptions
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState({ postings: [], count: 0 });
  const [nextLastId, setNextLastId] = useState('');
  const [paginationHistory, setPaginationHistory] = useState(['']);
  const [pageIndex, setPageIndex] = useState(0);
  const [lastIdFromResponse, setLastIdFromResponse] = useState('');
  const [lastFetchTime, setLastFetchTime] = useState(null);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleWithToggle = (field) => {
    setForm((prev) => ({
      ...prev,
      with: {
        ...prev.with,
        [field]: !prev.with[field]
      }
    }));
  };

  const buildFilterPayload = () => {
    if (filterMode === 'cutoff') {
      if (!form.cutoff_from && !form.cutoff_to) {
        throw new Error('Укажите минимум одно значение cutoff');
      }
      return {
        cutoff_from: form.cutoff_from ? toIsoString(form.cutoff_from) : undefined,
        cutoff_to: form.cutoff_to ? toIsoString(form.cutoff_to) : undefined
      };
    }
    if (!form.delivering_date_from && !form.delivering_date_to) {
      throw new Error('Укажите минимум одну дату передачи в доставку');
    }
    return {
      delivering_date_from: form.delivering_date_from ? toIsoString(form.delivering_date_from) : undefined,
      delivering_date_to: form.delivering_date_to ? toIsoString(form.delivering_date_to) : undefined
    };
  };

  const currentLastId = paginationHistory[pageIndex] || '';

  const resetPaginationState = () => {
    setPaginationHistory(['']);
    setPageIndex(0);
    setNextLastId('');
    setLastIdFromResponse('');
  };

  const submitRequest = async ({ lastIdOverride = currentLastId } = {}) => {
    if (!currentProfile) {
      alert('Выберите профиль на главной странице');
      return false;
    }
    setLoading(true);
    setError('');
    try {
      const payload = {
        dir: form.dir,
        limit: Number(form.limit) || 50,
        last_id: lastIdOverride ? String(lastIdOverride) : undefined,
        filter: buildFilterPayload(),
        with: form.with,
        profileId: currentProfile.id
      };

      const response = await fetch('/api/orders/postings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось получить отправления');
      }

      const postings = data?.result?.postings || data?.postings || [];
      const count = data?.result?.count ?? data?.count ?? postings.length;
      const nextPageId = data?.result?.last_id ?? data?.last_id ?? '';
      setResult({ postings, count });
      setNextLastId(nextPageId);
      setLastIdFromResponse(nextPageId);
      setLastFetchTime(new Date());
      return true;
    } catch (err) {
      console.error('postings error', err);
      setError(err.message || 'Ошибка запроса');
      setResult({ postings: [], count: 0 });
      setNextLastId('');
      setLastIdFromResponse('');
      setLastFetchTime(null);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleInitialRequest = async () => {
    resetPaginationState();
    await submitRequest({ lastIdOverride: '' });
  };

  const handleNextPage = async () => {
    if (!lastIdFromResponse || loading) return;
    const prevHistory = paginationHistory;
    const prevIndex = pageIndex;
    const nextId = lastIdFromResponse;
    const newHistory = [...prevHistory.slice(0, prevIndex + 1), nextId];
    setPaginationHistory(newHistory);
    setPageIndex(newHistory.length - 1);
    const success = await submitRequest({ lastIdOverride: nextId });
    if (!success) {
      setPaginationHistory(prevHistory);
      setPageIndex(prevIndex);
    }
  };

  const handlePrevPage = async () => {
    if (pageIndex === 0 || loading) return;
    const prevHistory = paginationHistory;
    const prevIndex = pageIndex;
    const targetIndex = prevIndex - 1;
    const targetLastId = prevHistory[targetIndex] || '';
    setPageIndex(targetIndex);
    const success = await submitRequest({ lastIdOverride: targetLastId });
    if (!success) {
      setPageIndex(prevIndex);
    }
  };

  const renderProducts = (posting) => {
    const products = posting?.products || [];
    if (!products.length) return '—';
    return products
      .map((product) => `${product.offer_id || product.offerId} × ${product.quantity || 1}`)
      .join(', ');
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/" legacyBehavior>
          <a style={{ color: '#0d6efd', textDecoration: 'none', fontSize: 14 }}>← На главную</a>
        </Link>
      </div>
      <h1 style={{ marginBottom: 10 }}>Отправления FBS</h1>
      <p style={{ color: '#555', marginBottom: 20 }}>
        Получение списка отправлений через /v3/posting/fbs/unfulfilled/list. Заполните фильтр по времени сборки или дате передачи.
      </p>

      <section
        style={{
          backgroundColor: '#f8f9fa',
          padding: 16,
          borderRadius: 10,
          marginBottom: 20,
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>Сортировка</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['desc', 'asc'].map((direction) => (
              <button
                key={direction}
                type="button"
                onClick={() => handleFormChange('dir', direction)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: form.dir === direction ? '2px solid #0d6efd' : '1px solid #ced4da',
                  backgroundColor: form.dir === direction ? '#e7f1ff' : '#fff',
                  cursor: 'pointer'
                }}
              >
                {direction === 'desc' ? 'По убыванию' : 'По возрастанию'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>Лимит (1-1000)</label>
          <input
            type="number"
            min="1"
            max="1000"
            value={form.limit}
            onChange={(e) => handleFormChange('limit', e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>Тип фильтра</label>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
          >
            <option value="cutoff">Время сборки (cutoff)</option>
            <option value="delivering">Дата передачи в доставку</option>
          </select>
        </div>
        {filterMode === 'cutoff' ? (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>Cutoff from</label>
              <input
                type="datetime-local"
                value={formatDateTimeInput(form.cutoff_from)}
                onChange={(e) => handleFormChange('cutoff_from', e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>Cutoff to</label>
              <input
                type="datetime-local"
                value={formatDateTimeInput(form.cutoff_to)}
                onChange={(e) => handleFormChange('cutoff_to', e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>Delivering date from</label>
              <input
                type="date"
                value={form.delivering_date_from}
                onChange={(e) => handleFormChange('delivering_date_from', e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#6c757d', marginBottom: 4 }}>Delivering date to</label>
              <input
                type="date"
                value={form.delivering_date_to}
                onChange={(e) => handleFormChange('delivering_date_to', e.target.value)}
                style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ced4da' }}
              />
            </div>
          </>
        )}
      </section>

      <section
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          padding: 16,
          marginBottom: 20
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: 10 }}>Дополнительные поля (with)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {[
            { field: 'analytics_data', label: 'Аналитика' },
            { field: 'barcodes', label: 'Штрихкоды' },
            { field: 'financial_data', label: 'Финансы' },
            { field: 'legal_info', label: 'Юр. информация' },
            { field: 'translit', label: 'Транслитерация' }
          ].map((option) => (
            <label key={option.field} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={form.with[option.field]}
                onChange={() => handleWithToggle(option.field)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={handleInitialRequest}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#6c757d' : '#0d6efd',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Запрашиваем...' : 'Получить отправления'}
        </button>
      </div>

      {error && <div style={{ color: '#dc3545', marginBottom: 20 }}>Ошибка: {error}</div>}

      <section style={{ marginBottom: 20, backgroundColor: '#f8f9fa', padding: 12, borderRadius: 10 }}>
        <div>Всего найдено: <strong>{result.count}</strong></div>
        <div>Текущая страница: <strong>{pageIndex + 1}</strong></div>
        <div>Токен следующей страницы: <code>{nextLastId || '—'}</code></div>
        <div>Последнее обновление: {lastFetchTime ? lastFetchTime.toLocaleString('ru-RU') : '—'}</div>
      </section>

      <section>
        <h2>Результаты</h2>
        {result.postings.length === 0 && !loading ? (
          <div style={{ color: '#6c757d' }}>Отправления не найдены.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ padding: 8, border: '1px solid #dee2e6' }}>Posting #</th>
                  <th style={{ padding: 8, border: '1px solid #dee2e6' }}>Статус</th>
                  <th style={{ padding: 8, border: '1px solid #dee2e6' }}>Заказ</th>
                  <th style={{ padding: 8, border: '1px solid #dee2e6' }}>Отгрузка</th>
                  <th style={{ padding: 8, border: '1px solid #dee2e6' }}>Доставка</th>
                  <th style={{ padding: 8, border: '1px solid #dee2e6' }}>Товары</th>
                  <th style={{ padding: 8, border: '1px solid #dee2e6' }}>Штрихкоды</th>
                </tr>
              </thead>
              <tbody>
                {result.postings.map((posting) => (
                  <tr key={posting.posting_number}>
                    <td style={{ padding: 8, border: '1px solid #dee2e6', fontFamily: 'monospace' }}>
                      {posting.posting_number}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #dee2e6' }}>{posting.status || '—'}</td>
                    <td style={{ padding: 8, border: '1px solid #dee2e6' }}>
                      {posting.order_number || posting.order_id || '—'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #dee2e6' }}>
                      {posting.shipment_date || posting.shipment_date_without_delay || '—'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #dee2e6' }}>
                      {posting.delivering_date || '—'}
                    </td>
                    <td style={{ padding: 8, border: '1px solid #dee2e6' }}>{renderProducts(posting)}</td>
                    <td style={{ padding: 8, border: '1px solid #dee2e6' }}>
                      {posting?.barcodes?.upper_barcode || posting?.barcodes?.lower_barcode
                        ? [posting?.barcodes?.upper_barcode, posting?.barcodes?.lower_barcode]
                            .filter(Boolean)
                            .join(' / ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={pageIndex === 0 || loading}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: pageIndex === 0 || loading ? '#d1d5db' : '#0d6efd',
              color: '#fff',
              cursor: pageIndex === 0 || loading ? 'not-allowed' : 'pointer'
            }}
          >
            Предыдущая
          </button>
          <button
            type="button"
            onClick={handleNextPage}
            disabled={!lastIdFromResponse || loading}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: !lastIdFromResponse || loading ? '#d1d5db' : '#198754',
              color: '#fff',
              cursor: !lastIdFromResponse || loading ? 'not-allowed' : 'pointer'
            }}
          >
            Следующая
          </button>
        </div>
      </section>
    </div>
  );
}

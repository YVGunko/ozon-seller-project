import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProfileManager } from '../src/utils/profileManager';
import { useWarehouses } from '../src/hooks/useWarehouses';
import { OzonProxyService } from '../src/services/ozon-proxy-client';
import { generateBarcodesForEntries } from '../src/utils/importStatusClient';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'true', label: 'Да' },
  { value: 'false', label: 'Нет' }
];

const DEFAULT_FILTERS = {
  archived: 'all',
  has_fbo_stocks: 'all',
  has_fbs_stocks: 'all'
};

const DEFAULT_TEXT_FILTERS = {
  productId: '',
  offerId: ''
};

const DEFAULT_PRESENCE_FILTERS = {
  barcodes: 'all',
  images: 'all'
};

const chunkArray = (items, chunkSize = 100) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const formatBooleanLabel = (value) => (value ? 'Да' : 'Нет');
const formatStockErrors = (errors) => {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Неизвестная ошибка';
  }
  return errors
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (entry?.message && entry?.code) return `${entry.code}: ${entry.message}`;
      if (entry?.message) return entry.message;
      if (entry?.code) return entry.code;
      try {
        return JSON.stringify(entry);
      } catch (jsonError) {
        return 'Ошибка';
      }
    })
    .join(', ');
};

export default function AttentionPage() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [textFilters, setTextFilters] = useState(DEFAULT_TEXT_FILTERS);
  const [presenceFilters, setPresenceFilters] = useState(DEFAULT_PRESENCE_FILTERS);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [stockFormVisible, setStockFormVisible] = useState(false);
  const [stockValue, setStockValue] = useState('');
  const [stockSubmitting, setStockSubmitting] = useState(false);
  const [stockResult, setStockResult] = useState(null);
  const [stockError, setStockError] = useState(null);
  const [barcodeSubmitting, setBarcodeSubmitting] = useState(false);
  const [barcodeStatus, setBarcodeStatus] = useState('');
  const [barcodeError, setBarcodeError] = useState('');
  const [offerUpdateSubmitting, setOfferUpdateSubmitting] = useState(false);
  const [offerUpdateStatus, setOfferUpdateStatus] = useState('');
  const [offerUpdateError, setOfferUpdateError] = useState('');
  const [priceLogSubmitting, setPriceLogSubmitting] = useState(false);
  const [priceLogStatus, setPriceLogStatus] = useState('');
  const [priceLogError, setPriceLogError] = useState('');
  const [netLogSubmitting, setNetLogSubmitting] = useState(false);
  const [netLogStatus, setNetLogStatus] = useState('');
  const [netLogError, setNetLogError] = useState('');

  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  const {
    warehouses,
    loading: warehousesLoading,
    error: warehouseError,
    selectedWarehouse,
    refreshWarehouses,
    selectWarehouse
  } = useWarehouses(currentProfile);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleTextFilterChange = (field, value) => {
    setTextFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handlePresenceFilterChange = (field, value) => {
    setPresenceFilters((prev) => ({ ...prev, [field]: value }));
  };

  const collectIds = (items) => {
    const offers = Array.from(
      new Set(
        items
          .map((item) => item?.offer_id || item?.offerId)
          .filter((id) => id !== undefined && id !== null && String(id).trim() !== '')
          .map((id) => String(id))
      )
    );
    const productIds = Array.from(
      new Set(
        items
          .map((item) => item?.product_id || item?.productId || item?.id)
          .filter((id) => id !== undefined && id !== null)
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      )
    );
    return { offers, productIds };
  };

  const handleLogPrices = async (mode = 'price') => {
    const isNet = mode === 'net_price';
    const setSubmitting = isNet ? setNetLogSubmitting : setPriceLogSubmitting;
    const setStatus = isNet ? setNetLogStatus : setPriceLogStatus;
    const setErr = isNet ? setNetLogError : setPriceLogError;

    if (!currentProfile) {
      setErr('Профиль не выбран');
      return;
    }
    if (!filteredCount) {
      setErr('Нет товаров для записи');
      return;
    }

    const { offers, productIds } = collectIds(filteredItems);
    if (!offers.length && !productIds.length) {
      setErr('Нет offer_id или product_id для записи');
      return;
    }

    setSubmitting(true);
    setStatus('');
    setErr('');
    try {
      const response = await fetch('/api/operations/price-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerIds: offers,
          productIds,
          mode,
          profileId: currentProfile.id
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось записать цены');
      }

      setStatus(
        `${isNet ? 'net_price' : 'Цены'} записаны: ${data.logged || 0} из ${data.total || 0}`
      );
    } catch (logError) {
      console.error('[AttentionPage] price log error', logError);
      setErr(logError.message || 'Не удалось записать цены');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleOperations = () => {
    setOperationsOpen((prev) => {
      const next = !prev;
      if (!next) {
        setStockFormVisible(false);
        setStockError(null);
      }
      return next;
    });
  };

  const startStockUpdate = () => {
    if (!canUpdateStocks) return;
    setStockFormVisible(true);
    setStockError(null);
    setStockResult(null);
  };

  const cancelStockUpdate = () => {
    setStockFormVisible(false);
    setStockValue('');
    setStockError(null);
  };

  const handleScan = async () => {
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль на главной странице');
      return;
    }

    setScanning(true);
    setError(null);
    setResult(null);
    setStockResult(null);
    setStockError(null);
    setStockFormVisible(false);
    setStockValue('');

    try {
      const response = await fetch('/api/attention-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: currentProfile.id,
          filters,
          limit: 1000,
          maxPages: 10
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Не удалось получить список товаров');
      }

      const data = await response.json();
      setResult(data);
    } catch (scanError) {
      console.error('[AttentionPage] scan error', scanError);
      setError(scanError.message || 'Не удалось получить список товаров');
    } finally {
      setScanning(false);
    }
  };

  const matchingItems = useMemo(() => result?.items || [], [result]);
  const filteredItems = useMemo(() => {
    if (!matchingItems.length) return [];
    const productPrefix = textFilters.productId.trim();
    const offerPrefix = textFilters.offerId.trim().toLowerCase();
    return matchingItems.filter((item) => {
      if (productPrefix) {
        const productIdString = String(item?.product_id ?? '');
        if (!productIdString.startsWith(productPrefix)) {
          return false;
        }
      }
      if (offerPrefix) {
        const offerIdString = String(item?.offer_id ?? '').toLowerCase();
        if (!offerIdString.startsWith(offerPrefix)) {
          return false;
        }
      }
      if (presenceFilters.barcodes !== 'all') {
        const hasBarcodes = Array.isArray(item?.barcodes) && item.barcodes.length > 0;
        if (presenceFilters.barcodes === 'true' && !hasBarcodes) return false;
        if (presenceFilters.barcodes === 'false' && hasBarcodes) return false;
      }
      if (presenceFilters.images !== 'all') {
        const hasImages = Array.isArray(item?.images) && item.images.length > 0;
        if (presenceFilters.images === 'true' && !hasImages) return false;
        if (presenceFilters.images === 'false' && hasImages) return false;
      }
      return true;
    });
  }, [matchingItems, textFilters, presenceFilters]);

  const filteredCount = filteredItems.length;
  const stockResultEntries = Array.isArray(stockResult) ? stockResult : [];
  const stockSuccessCount = stockResultEntries.filter(
    (entry) => entry?.updated && (!entry?.errors || entry.errors.length === 0)
  ).length;
  const stockErrorEntries = stockResultEntries.filter(
    (entry) => Array.isArray(entry?.errors) && entry.errors.length > 0
  );
  const canUpdateStocks = Boolean(currentProfile && selectedWarehouse && filteredCount > 0);
  const itemsWithoutBarcodes = filteredItems.filter(
    (item) => !Array.isArray(item?.barcodes) || item.barcodes.length === 0
  );
  const canGenerateBarcodes = Boolean(currentProfile && itemsWithoutBarcodes.length > 0);
  const itemsWithOfferPattern = filteredItems.filter((item) => /^PL-ko\s+\d+/i.test(item?.offer_id || ''));
  const canUpdateOffers = Boolean(currentProfile && itemsWithOfferPattern.length > 0);

  const handleStockSubmit = async () => {
    if (!currentProfile) {
      setStockError('Профиль не выбран');
      return;
    }
    if (!selectedWarehouse) {
      setStockError('Выберите склад для обновления остатков');
      return;
    }
    if (!filteredCount) {
      setStockError('Нет товаров, подходящих под текущие фильтры');
      return;
    }

    const stockNumber = Number(stockValue);
    if (!Number.isFinite(stockNumber) || stockNumber < 0) {
      setStockError('Введите корректное количество (0 или больше)');
      return;
    }

    const warehouseId = Number(selectedWarehouse.warehouse_id);
    if (!Number.isFinite(warehouseId) || warehouseId <= 0) {
      setStockError('Некорректный warehouse_id');
      return;
    }

    const stocksPayload = filteredItems
      .map((item) => {
        const offerId = item?.offer_id ? String(item.offer_id) : '';
        const productNumeric = Number(item?.product_id);
        const payload = {
          stock: stockNumber,
          warehouse_id: warehouseId
        };
        if (offerId) {
          payload.offer_id = offerId;
        }
        if (Number.isFinite(productNumeric) && productNumeric > 0) {
          payload.product_id = productNumeric;
        }
        if (!payload.offer_id && payload.product_id === undefined) {
          return null;
        }
        return payload;
      })
      .filter(Boolean);

    if (!stocksPayload.length) {
      setStockError('Не удалось подготовить товары для обновления остатков');
      return;
    }

    setStockSubmitting(true);
    setStockError(null);
    setStockResult(null);

    try {
      const chunks = chunkArray(stocksPayload, 100);
      const aggregatedResults = [];

      for (const chunk of chunks) {
        const response = await fetch('/api/stocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: currentProfile.id,
            stocks: chunk
          })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Не удалось обновить остатки');
        }

        const data = await response.json();
        const entries = Array.isArray(data?.result) ? data.result : [];
        aggregatedResults.push(...entries);
      }

      setStockResult(aggregatedResults);
      setStockValue('');
    } catch (submitError) {
      console.error('[AttentionPage] stock update error', submitError);
      setStockError(submitError.message || 'Не удалось обновить остатки');
    } finally {
      setStockSubmitting(false);
    }
  };

  const handleGenerateBarcodes = async () => {
    if (!currentProfile) {
      setBarcodeError('Профиль не выбран');
      return;
    }
    if (!itemsWithoutBarcodes.length) {
      setBarcodeError('Нет товаров без штрихкодов в текущем списке');
      return;
    }
    try {
      setBarcodeSubmitting(true);
      setBarcodeError('');
      setBarcodeStatus('Отправляем запросы на генерацию штрихкодов…');
      const proxyService = new OzonProxyService(currentProfile);
      const entries = itemsWithoutBarcodes.map((item) => ({
        productId: item?.product_id ?? item?.id,
        offerId: item?.offer_id
      }));
      const barcodeMap = await generateBarcodesForEntries({
        service: proxyService,
        entries,
        logger: console
      });
      const successCount = Array.from(barcodeMap.values()).filter(
        (entry) => entry?.barcode && !entry?.barcodeError
      ).length;
      const errorCount = Array.from(barcodeMap.values()).filter(
        (entry) => entry?.barcodeError
      ).length;
      setBarcodeStatus(
        `Штрихкоды сгенерированы для ${successCount} товаров${
          errorCount ? `, ошибок: ${errorCount}` : ''
        }. Обновите список, чтобы увидеть изменения.`
      );
    } catch (barcodeErr) {
      console.error('[AttentionPage] barcode error', barcodeErr);
      setBarcodeError(barcodeErr.message || 'Не удалось сгенерировать штрихкоды');
      setBarcodeStatus('');
    } finally {
      setBarcodeSubmitting(false);
    }
  };

  const handleOfferUpdates = async () => {
    if (!currentProfile) {
      setOfferUpdateError('Профиль не выбран');
      return;
    }
    if (!itemsWithOfferPattern.length) {
      setOfferUpdateError('Нет товаров, подходящих под шаблон PL-ko ####');
      return;
    }
    try {
      setOfferUpdateSubmitting(true);
      setOfferUpdateError('');
      setOfferUpdateStatus('Обновляем артикулы…');
      const proxyService = new OzonProxyService(currentProfile);
      let success = 0;
      let failed = 0;
      for (const chunk of chunkArray(itemsWithOfferPattern, 100)) {
        const updateOfferId = chunk
          .map((item) => {
            const offerId = item?.offer_id || '';
            const match = offerId.match(/^(PL-ko\s+)(\d+)(.*)$/i);
            if (!match) return null;
            const [, prefix, digits, suffix] = match;
            const trimmedSuffix = suffix?.trimStart() || '';
            const newOfferId = `${prefix}${digits}MP${trimmedSuffix ? ` ${trimmedSuffix}` : ''}`;
            return {
              offer_id: offerId,
              new_offer_id: newOfferId
            };
          })
          .filter(Boolean);
        if (!updateOfferId.length) continue;
        try {
          const response = await proxyService.post('/api/products/update-offer-id', {
            update_offer_id: updateOfferId
          });
          const errors = Array.isArray(response?.errors) ? response.errors : [];
          success += updateOfferId.length - errors.length;
          failed += errors.length;
        } catch (apiError) {
          console.error('[AttentionPage] offer update chunk failed', apiError);
          failed += updateOfferId.length;
        }
      }
      setOfferUpdateStatus(`Артикулы обновлены: ${success}. Ошибок: ${failed}.`);
    } catch (updateError) {
      console.error('[AttentionPage] offer update error', updateError);
      setOfferUpdateError(updateError.message || 'Не удалось обновить артикулы');
      setOfferUpdateStatus('');
    } finally {
      setOfferUpdateSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 15 }}>
        <Link href="/" passHref>
          <div style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14, cursor: 'pointer' }}>
            ← На главную
          </div>
        </Link>
      </div>

      <h1 style={{ marginTop: 0 }}>Товары, требующие внимания</h1>
      <p style={{ color: '#6c757d', maxWidth: 720 }}>
        Этот раздел собирает товары из OZON через /v3/product/list и позволяет быстро найти позиции,
        которые попадают под выбранные критерии: архив, наличие FBO/FBS остатков и т.д.
      </p>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          marginBottom: 20
        }}
      >
        <div
          style={{
            flex: '1 1 320px',
            padding: 15,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            backgroundColor: '#fff'
          }}
        >
          {currentProfile ? (
            <div>
              <div style={{ fontWeight: 'bold', color: '#28a745' }}>✅ Используется профиль</div>
            <div style={{ marginTop: 4 }}>
              {currentProfile.name} (Client ID: {currentProfile.client_hint || '—'})
            </div>
            </div>
          ) : (
            <div style={{ color: '#dc3545' }}>
              ⚠️ Профиль не выбран. Вернитесь на главную и выберите доступ к OZON.
            </div>
          )}
        </div>

        <div
          style={{
            flex: '1 1 360px',
            padding: 15,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            backgroundColor: '#fff'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>🏬 Склад для операций</div>
          {!currentProfile ? (
            <div style={{ color: '#6c757d' }}>Выберите профиль, чтобы увидеть склады.</div>
          ) : warehousesLoading ? (
            <div style={{ color: '#6c757d' }}>Загрузка списка складов…</div>
          ) : warehouses.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <select
                  value={selectedWarehouse?.warehouse_id || ''}
                  onChange={(event) => selectWarehouse(event.target.value)}
                  style={{
                    flex: 1,
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #ced4da'
                  }}
                >
                  <option value="">Не выбран</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.warehouse_id} value={warehouse.warehouse_id}>
                      {warehouse.name} — {warehouse.status_label || warehouse.status || '—'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={refreshWarehouses}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 4,
                    border: '1px solid #0070f3',
                    backgroundColor: 'transparent',
                    color: '#0070f3',
                    cursor: 'pointer'
                  }}
                >
                  Обновить
                </button>
              </div>
              {selectedWarehouse ? (
                <div style={{ fontSize: 12, color: '#6c757d' }}>
                  Выбрано: {selectedWarehouse.name} —{' '}
                  {selectedWarehouse.status_label || selectedWarehouse.status || '—'} (ID:{' '}
                  {selectedWarehouse.warehouse_id})
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#6c757d' }}>Склад не выбран.</div>
              )}
            </div>
          ) : (
            <div style={{ color: '#6c757d' }}>Список складов пуст — обновите или проверьте профиль.</div>
          )}
          {warehouseError && (
            <div style={{ marginTop: 8, color: '#dc3545', fontSize: 12 }}>{warehouseError}</div>
          )}
        </div>
      </div>

      <div
        style={{
          backgroundColor: '#f5f5f5',
          padding: 20,
          borderRadius: 8,
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16
        }}
      >
        {(['archived', 'has_fbo_stocks', 'has_fbs_stocks']).map((key) => (
          <div key={key}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold' }}>
              {key === 'archived' && 'В архиве'}
              {key === 'has_fbo_stocks' && 'Есть остатки FBO'}
              {key === 'has_fbs_stocks' && 'Есть остатки FBS'}
            </label>
            <select
              value={filters[key]}
              onChange={(event) => handleFilterChange(key, event.target.value)}
              style={{
                width: '100%',
                padding: 8,
                borderRadius: 4,
                border: '1px solid #ced4da'
              }}
            >
              {FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold' }}>
            Есть штрихкод
          </label>
          <select
            value={presenceFilters.barcodes}
            onChange={(event) => handlePresenceFilterChange('barcodes', event.target.value)}
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 4,
              border: '1px solid #ced4da'
            }}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold' }}>
            Есть фото
          </label>
          <select
            value={presenceFilters.images}
            onChange={(event) => handlePresenceFilterChange('images', event.target.value)}
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 4,
              border: '1px solid #ced4da'
            }}
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold' }}>
            Product ID начинается с
          </label>
          <input
            type="text"
            value={textFilters.productId}
            onChange={(event) => handleTextFilterChange('productId', event.target.value)}
            placeholder="Например, 311"
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 4,
              border: '1px solid #ced4da'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold' }}>
            Артикул начинается с
          </label>
          <input
            type="text"
            value={textFilters.offerId}
            onChange={(event) => handleTextFilterChange('offerId', event.target.value)}
            placeholder="Например, Черн"
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 4,
              border: '1px solid #ced4da'
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 20, display: 'flex', gap: 12 }}>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            padding: '12px 24px',
            backgroundColor: scanning ? '#6c757d' : '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: scanning ? 'default' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {scanning ? 'Загружаем...' : 'Сканировать товары'}
        </button>
        <button
          onClick={() => {
            setFilters(DEFAULT_FILTERS);
            setTextFilters(DEFAULT_TEXT_FILTERS);
            setPresenceFilters(DEFAULT_PRESENCE_FILTERS);
            setResult(null);
            setError(null);
            setStockResult(null);
            setStockError(null);
            setStockFormVisible(false);
            setStockValue('');
          }}
          disabled={scanning}
          style={{
            padding: '12px 20px',
            backgroundColor: '#f8f9fa',
            color: '#343a40',
            border: '1px solid #ced4da',
            borderRadius: 6,
            cursor: scanning ? 'default' : 'pointer'
          }}
        >
          Сбросить фильтры
        </button>
      </div>

      {error && (
        <div style={{ color: '#dc3545', marginBottom: 20 }}>
          Ошибка: {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginBottom: 20,
            padding: 15,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            backgroundColor: '#fff'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Сводка</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14, color: '#495057' }}>
            <div>Получено страниц: {result.pagesFetched}</div>
            <div>Товаров загружено: {result.totalFetched}</div>
            <div>Под условия подходят: <strong>{result.matchedCount}</strong></div>
            <div>После текстовых фильтров: <strong>{filteredItems.length}</strong></div>
            <div>Запросов к info/list: {result.infoChunks ?? 0}</div>
            <div>Время запроса: {(result.durationMs / 1000).toFixed(1)} сек.</div>
            {result.hasMore && (
              <div style={{ color: '#dc3545' }}>
                Есть ещё данные — увеличьте количество страниц или повторите запрос
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          backgroundColor: '#fff',
          marginBottom: 20
        }}
      >
        <button
          type="button"
          onClick={toggleOperations}
          style={{
            width: '100%',
            padding: '12px 15px',
            background: 'none',
            border: 'none',
            textAlign: 'left',
            fontWeight: 'bold',
            cursor: 'pointer',
            borderBottom: operationsOpen ? '1px solid #e5e7eb' : 'none'
          }}
        >
          {operationsOpen ? '▾' : '▸'} Операции
        </button>
        {operationsOpen && (
          <div style={{ padding: 15 }}>
            <div style={{ marginBottom: 10, color: '#6c757d', fontSize: 14 }}>
              Текущий склад:{' '}
              {selectedWarehouse
                ? `${selectedWarehouse.name} (ID: ${selectedWarehouse.warehouse_id})`
                : 'не выбран'}
            </div>
            <div style={{ marginBottom: 10, color: '#6c757d', fontSize: 14 }}>
              Товаров после фильтров: <strong>{filteredCount}</strong>
            </div>
            <button
              type="button"
              onClick={startStockUpdate}
              disabled={!canUpdateStocks || stockSubmitting}
              style={{
                padding: '10px 18px',
                backgroundColor: canUpdateStocks ? '#17a2b8' : '#adb5bd',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: canUpdateStocks ? 'pointer' : 'not-allowed',
                marginBottom: 12
              }}
            >
              Установить остаток
            </button>
            <button
              type="button"
              onClick={handleGenerateBarcodes}
              disabled={!canGenerateBarcodes || barcodeSubmitting}
              style={{
                padding: '10px 18px',
                backgroundColor: canGenerateBarcodes ? '#0ea5e9' : '#adb5bd',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: canGenerateBarcodes ? 'pointer' : 'not-allowed',
                marginBottom: 12,
                marginLeft: 12
              }}
            >
              Сгенерировать штрихкод
            </button>
            <button
              type="button"
              onClick={handleOfferUpdates}
              disabled={!canUpdateOffers || offerUpdateSubmitting}
              style={{
                padding: '10px 18px',
                backgroundColor: canUpdateOffers ? '#f97316' : '#adb5bd',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: canUpdateOffers ? 'pointer' : 'not-allowed',
                marginBottom: 12,
                marginLeft: 12
              }}
            >
              Обновить артикул (PL-ko → PL-ko NMP)
            </button>
            <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => handleLogPrices('price')}
                disabled={!filteredCount || priceLogSubmitting}
                style={{
                  padding: '10px 18px',
                  backgroundColor: filteredCount && !priceLogSubmitting ? '#16a34a' : '#adb5bd',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor:
                    filteredCount && !priceLogSubmitting ? 'pointer' : 'not-allowed'
                }}
              >
                {priceLogSubmitting ? 'Записываем…' : 'Записать цены (v5)'}
              </button>
              <button
                type="button"
                onClick={() => handleLogPrices('net_price')}
                disabled={!filteredCount || netLogSubmitting}
                style={{
                  padding: '10px 18px',
                  backgroundColor: filteredCount && !netLogSubmitting ? '#2563eb' : '#adb5bd',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor:
                    filteredCount && !netLogSubmitting ? 'pointer' : 'not-allowed'
                }}
              >
                {netLogSubmitting ? 'Записываем…' : 'Записать net_price'}
              </button>
            </div>
            {stockFormVisible && (
              <div
                style={{
                  padding: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  backgroundColor: '#f8f9fa',
                  marginBottom: 12
                }}
              >
                <div style={{ marginBottom: 8, fontSize: 14 }}>
                  Укажите единое количество для {filteredCount} товаров:
                </div>
                <input
                  type="number"
                  min="0"
                  value={stockValue}
                  onChange={(event) => setStockValue(event.target.value)}
                  placeholder="Например, 100"
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 4,
                    border: '1px solid #ced4da',
                    marginBottom: 10
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleStockSubmit}
                    disabled={stockSubmitting}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: stockSubmitting ? 'default' : 'pointer'
                    }}
                  >
                    {stockSubmitting ? 'Сохраняем…' : 'Записать'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelStockUpdate}
                    disabled={stockSubmitting}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#f8f9fa',
                      border: '1px solid #ced4da',
                      borderRadius: 4,
                      cursor: stockSubmitting ? 'default' : 'pointer'
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
            {stockError && (
              <div style={{ color: '#dc3545', marginBottom: 12 }}>{stockError}</div>
            )}
            {barcodeError && (
              <div style={{ color: '#dc3545', marginBottom: 12 }}>{barcodeError}</div>
            )}
            {barcodeStatus && (
              <div style={{ color: '#0f5132', marginBottom: 12 }}>{barcodeStatus}</div>
            )}
            {offerUpdateError && (
              <div style={{ color: '#dc3545', marginBottom: 12 }}>{offerUpdateError}</div>
            )}
            {offerUpdateStatus && (
              <div style={{ color: '#0f5132', marginBottom: 12 }}>{offerUpdateStatus}</div>
            )}
            {priceLogError && (
              <div style={{ color: '#dc3545', marginBottom: 12 }}>{priceLogError}</div>
            )}
            {priceLogStatus && (
              <div style={{ color: '#0f5132', marginBottom: 12 }}>{priceLogStatus}</div>
            )}
            {netLogError && (
              <div style={{ color: '#dc3545', marginBottom: 12 }}>{netLogError}</div>
            )}
            {netLogStatus && (
              <div style={{ color: '#0f5132', marginBottom: 12 }}>{netLogStatus}</div>
            )}
            {stockResultEntries.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 6,
                  backgroundColor: '#f1f3f5',
                  fontSize: 13
                }}
              >
                <div>
                  Успешно обновлено: {stockSuccessCount} из {stockResultEntries.length}
                </div>
                {stockErrorEntries.length > 0 && (
                  <div style={{ marginTop: 6, color: '#dc3545' }}>
                    Ошибки:
                    <ul style={{ margin: '6px 0 0 18px' }}>
                      {stockErrorEntries.slice(0, 5).map((entry) => (
                        <li key={`${entry.offer_id || 'offer'}-${entry.product_id || 'product'}`}>
                          {entry.offer_id || entry.product_id || '—'}: {formatStockErrors(entry.errors)}
                        </li>
                      ))}
                      {stockErrorEntries.length > 5 && (
                        <li>…и ещё {stockErrorEntries.length - 5} с ошибками</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {scanning && (
        <div style={{ color: '#6c757d', marginBottom: 20 }}>Загружаем данные из OZON...</div>
      )}

      {filteredItems.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: '#fff',
              borderRadius: 8,
              overflow: 'hidden'
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  Product ID
                </th>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  Артикул
                </th>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  В архиве
                </th>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  Остатки FBO
                </th>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  Остатки FBS
                </th>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  Уценён
                </th>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  Упаковки
                </th>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  Штрихкоды
                </th>
                <th style={{ padding: 12, borderBottom: '1px solid #dee2e6', textAlign: 'left' }}>
                  Фото
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={`${item.product_id}-${item.offer_id}`} style={{ borderBottom: '1px solid #f1f3f5' }}>
                  <td style={{ padding: 12 }}>{item.product_id || '—'}</td>
                  <td style={{ padding: 12, fontWeight: 'bold' }}>{item.offer_id || '—'}</td>
                  <td style={{ padding: 12, color: item.archived ? '#dc3545' : '#28a745' }}>
                    {formatBooleanLabel(item.archived)}
                  </td>
                  <td style={{ padding: 12, color: item.has_fbo_stocks ? '#28a745' : '#6c757d' }}>
                    {formatBooleanLabel(item.has_fbo_stocks)}
                  </td>
                  <td style={{ padding: 12, color: item.has_fbs_stocks ? '#28a745' : '#6c757d' }}>
                    {formatBooleanLabel(item.has_fbs_stocks)}
                  </td>
                  <td style={{ padding: 12, color: item.is_discounted ? '#ffc107' : '#6c757d' }}>
                    {formatBooleanLabel(item.is_discounted)}
                  </td>
                  <td style={{ padding: 12 }}>
                    {Array.isArray(item.quants) && item.quants.length > 0
                      ? item.quants
                          .map((quant) => `${quant.quant_code || '—'}: ${quant.quant_size ?? '—'}`)
                          .join(', ')
                      : '—'}
                  </td>
                  <td style={{ padding: 12, fontFamily: 'monospace', fontSize: 12 }}>
                    {Array.isArray(item.barcodes) && item.barcodes.length > 0
                      ? item.barcodes.join(', ')
                      : '—'}
                  </td>
                  <td style={{ padding: 12 }}>
                    {Array.isArray(item.images) && item.images.length > 0
                      ? `${item.images.length} шт.`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !scanning &&
        result && (
          <div style={{ color: '#6c757d', marginTop: 20 }}>
            По выбранным условиям товары не найдены.
          </div>
        )
      )}
    </div>
  );
}

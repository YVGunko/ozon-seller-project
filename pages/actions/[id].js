import { useRouter } from 'next/router';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useCurrentContext } from '../../src/hooks/useCurrentContext';

const formatNumber = (value) => {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
};

const columns = [
  { key: 'product_id', label: 'Product ID', hidden: true },
  { key: 'offer_id', label: 'Артикул' },
  { key: 'sku', label: 'SKU' },
  { key: 'price', label: 'Моя цена' },
  { key: 'min_price', label: 'Моя мин.цена' },
  { key: 'net_price', label: 'Моя прих.цена' },
  { key: 'max_action_price', label: 'Макс.цена акции Озон' },
  { key: 'action_price', label: 'Акц.цена' },
  { key: 'alert_max_action_price_failed', label: 'Выше реком.', format: (v) => (v ? 'Да' : 'Нет') },
  { key: 'alert_max_action_price', label: 'Реком.цена' },
  { key: 'my_action_price', label: 'Моя акц.цена' },
  { key: 'profit', label: 'Наценка' },
  { key: 'margin_cost', label: 'Наценка %' },
  { key: 'add_mode', label: 'Добавление' },
  { key: 'min_stock', label: 'Мин. сток' },
  { key: 'stock', label: 'Сток в акции' }
];

export default function ActionItemsPage() {
  const router = useRouter();
  const actionId = router.query.id;
  const { profile: currentProfile } = useCurrentContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [minMarkup, setMinMarkup] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [actionTitle, setActionTitle] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [elasticLoading, setElasticLoading] = useState(false);
  const [savedSettings, setSavedSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('candidates');

  const extractTitle = (data) => {
    if (!data) return '';
    const direct =
      data?.result?.title ||
      data?.title ||
      data?.result?.name ||
      data?.result?.action_title ||
      '';
    if (direct) return direct;
    const candidates =
      (Array.isArray(data?.result?.items) && data.result.items) ||
      (Array.isArray(data?.result?.products) && data.result.products) ||
      (Array.isArray(data?.result) && data.result) ||
      (Array.isArray(data?.items) && data.items) ||
      [];
    if (Array.isArray(candidates) && candidates.length) {
      const found = candidates.find((entry) => entry?.title) || candidates[0];
      return found?.title || '';
    }
    return '';
  };

  useEffect(() => {
    if (!router.isReady) return;
    const titleFromQuery = router.query.title;
    if (typeof titleFromQuery === 'string' && titleFromQuery.trim()) {
      setActionTitle(titleFromQuery.trim());
      console.log('[ActionItems] title from query', titleFromQuery.trim());
    }
  }, [router.isReady, router.query.title]);

  useEffect(() => {
    const loadSavedPricing = async () => {
      if (!currentProfile) return;
      try {
        const res = await fetch(
          `/api/actions/pricing-settings?profileId=${encodeURIComponent(currentProfile.id)}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          }
        );
        const data = await res.json();
        if (res.ok && data) {
          const next = {
            minMarkup: Number.isFinite(data.minMarkup) ? data.minMarkup : 0,
            taxPercent: Number.isFinite(data.taxPercent) ? data.taxPercent : 0,
            commissionPercent: Number.isFinite(data.commissionPercent) ? data.commissionPercent : 0,
            discountPercent: Number.isFinite(data.discountPercent) ? data.discountPercent : 0
          };
          setMinMarkup(next.minMarkup);
          setTaxPercent(next.taxPercent);
          setCommissionPercent(next.commissionPercent);
          setDiscountPercent(next.discountPercent);
          setSavedSettings(next);
        }
      } catch (err) {
        console.error('[ActionItems] failed to load pricing settings', err);
      }
    };
    loadSavedPricing();
  }, [currentProfile]);

  const refreshData = async () => {
    if (!actionId || !currentProfile) return;
    setLoading(true);
    setError('');
    try {
      const [candRes, prodRes] = await Promise.all([
        fetch('/api/actions/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: Number(actionId), limit: 500, profileId: currentProfile.id })
        }),
        fetch('/api/actions/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: Number(actionId), limit: 500, profileId: currentProfile.id })
        })
      ]);

      const candData = await candRes.json();
      const prodData = await prodRes.json();

      if (!candRes.ok) {
        throw new Error(candData?.error || 'Не удалось получить кандидатов');
      }
      if (!prodRes.ok) {
        throw new Error(prodData?.error || 'Не удалось получить товары акции');
      }

      const candidateItems = Array.isArray(candData?.result?.items)
        ? candData.result.items
        : Array.isArray(candData?.result?.products)
          ? candData.result.products
          : Array.isArray(candData?.items)
            ? candData.items
            : Array.isArray(candData?.result)
              ? candData.result
              : [];
      const participantItems = Array.isArray(prodData?.result?.products)
        ? prodData.result.products
        : [];

      if (!actionTitle) {
        const titleA = extractTitle(candData);
        const titleB = extractTitle(prodData);
        console.log('[ActionItems] title extraction fallback', {
          candTitle: titleA,
          prodTitle: titleB,
          candKeys: Object.keys(candData || {}),
          prodKeys: Object.keys(prodData || {})
        });
        const title = titleA || titleB || '';
        if (title) {
          setActionTitle(title);
        }
      }

      const productIds = Array.from(
        new Set([
          ...candidateItems.map((item) => item?.product_id ?? item?.id).filter(Boolean),
          ...participantItems.map((item) => item?.product_id ?? item?.id).filter(Boolean)
        ])
      )
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));

      let priceMap = new Map();
      let netPriceMap = new Map();
      if (productIds.length) {
        try {
          const priceRes = await fetch('/api/products/info-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productIds,
              limit: Math.min(productIds.length, 1000),
              profileId: currentProfile.id
            })
          });
          const priceData = await priceRes.json();
          if (priceRes.ok) {
            const items = Array.isArray(priceData?.items)
              ? priceData.items
              : Array.isArray(priceData?.result?.items)
                ? priceData.result.items
                : [];
            priceMap = new Map(
              items.map((it) => [
                String(it.product_id ?? it.id),
                {
                  ...it,
                  net_price:
                    it?.price?.net_price ??
                    it?.net_price ??
                    it?.price?.netPrice ??
                    null,
                  // min_price возвращается в корне элемента ответа /v5/product/info/prices
                  // (но на всякий случай учитываем и вложенный вариант).
                  min_price:
                    typeof it?.min_price === 'number'
                      ? it.min_price
                      : typeof it?.price?.min_price === 'number'
                        ? it.price.min_price
                        : null
                }
              ])
            );
          } else {
            console.error('[ActionItems] Failed to fetch price data', priceData);
          }

          const netRes = await fetch('/api/products/net-price-latest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productIds, profileId: currentProfile.id })
          });
          const netData = await netRes.json();
          if (netRes.ok) {
            const netItems = Array.isArray(netData?.items) ? netData.items : [];
            netPriceMap = new Map(
              netItems
                .filter((it) => it?.productId !== undefined)
                .map((it) => [String(it.productId), it.net_price ?? null])
            );
          } else {
            console.error('[ActionItems] Failed to fetch net price history', netData);
          }
        } catch (priceErr) {
          console.error('[ActionItems] Failed to fetch prices', priceErr);
        }
      }

      const withNetFallback = (items) =>
        items.map((item) => {
          const productId = item?.product_id ?? item?.id ?? item?.productId;
          const priceInfo = productId ? priceMap.get(String(productId)) : null;
          const netFromHistory = productId ? netPriceMap.get(String(productId)) : null;
          const pickNet = () => {
            const val = priceInfo?.net_price;
            if (Number.isFinite(val) && val > 0) return val;
            if (Number.isFinite(netFromHistory) && netFromHistory > 0) return netFromHistory;
            return null;
          };
          const net = pickNet();
          const minPrice = priceInfo?.min_price ?? null;
          return {
            ...item,
            product_id: productId,
            sku: productId,
            offer_id:
              item?.offer_id ??
              item?.offerId ??
              priceInfo?.offer_id ??
              priceInfo?.offerId ??
              null,
            net_price: net,
            min_price: minPrice
          };
        });

      setCandidates(withNetFallback(candidateItems));
      setParticipants(withNetFallback(participantItems));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Ошибка загрузки товаров акции');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [actionId, currentProfile]);

  const sanitizedPercent = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return 0;
    if (num > 99) return 99;
    return num;
  };

  const persistPricingSettings = async () => {
    if (!currentProfile) return;
    const current = {
      minMarkup: sanitizedPercent(minMarkup),
      taxPercent: sanitizedPercent(taxPercent),
      commissionPercent: sanitizedPercent(commissionPercent),
      discountPercent: sanitizedPercent(discountPercent)
    };
    if (
      savedSettings &&
      savedSettings.minMarkup === current.minMarkup &&
      savedSettings.taxPercent === current.taxPercent &&
      savedSettings.commissionPercent === current.commissionPercent &&
      savedSettings.discountPercent === current.discountPercent
    ) {
      return;
    }
    try {
      await fetch('/api/actions/pricing-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...current,
          profileId: currentProfile.id
        })
      });
      setSavedSettings(current);
    } catch (err) {
      console.error('[ActionItems] failed to save pricing settings', err);
    }
  };

  const calculations = useMemo(() => {
    const tax = sanitizedPercent(taxPercent);
    const commission = sanitizedPercent(commissionPercent);
    const discount = sanitizedPercent(discountPercent);
    const minMarkupVal = sanitizedPercent(minMarkup);
    return { tax, commission, discount, minMarkup: minMarkupVal };
  }, [taxPercent, commissionPercent, discountPercent, minMarkup]);

  const calcRow = (item) => {
    const price = Number(item?.price);
    const actionPrice = Number(item?.action_price); // установлена для товаров уже в акции
    const maxActionPrice = Number(item?.max_action_price); // предложенна Озон
    const net = Number(item?.net_price);
    const min = Number(item?.min_price);

    // базой для расчёта my_action_price берём price; если его нет, используем action_price как запасной вариант
    const basePrice = Number.isFinite(price) ? price : Number.isFinite(actionPrice) ? actionPrice : null;
    //const maxActionPrice = Number.isFinite(max_action_price) ? max_action_price : Number.isFinite(max_action_price) ? max_action_price : null;
    const validActionPrice = Number.isFinite(actionPrice) ? actionPrice : null;
    const validNet = Number.isFinite(net) && net > 0 ? net : null;
    const validMin = Number.isFinite(min) && min > 0 ? min : null;
    console.log('[ActionRow] values', {
      offer_id: item?.offer_id ?? item?.offerId,
      price,
      actionPrice,
      basePrice,
      validActionPrice,
      validMin,
      maxActionPrice,
    });
    //ActionPrice - цена по акции предлагаемая Озон
    const myActionPrice =
      (validActionPrice !== null & validActionPrice !== 0) ? validActionPrice : Math.round(basePrice * (1 - calculations.discount / 100));

    console.log('[myActionPrice] values', {
      offer_id: item?.offer_id ?? item?.offerId,
      myActionPrice
    });

    const profit =
      (myActionPrice !== null && validNet !== null && validNet !== 0)
        ? myActionPrice * (1 - calculations.tax / 100 - calculations.commission / 100) -
        validNet
        : (maxActionPrice !== null && maxActionPrice !== 0 && validMin !== 0) ? maxActionPrice - validMin : 0;

    const marginCost =
      (profit !== null && validNet)
        ? (profit / validNet) * 100
        : (profit !== null && validMin) ? (profit / validMin) * 100 : 0;
    
    return {
      ...item,
      my_action_price: myActionPrice,
      profit,
      margin_cost: marginCost
    };
  };

  const handleImportPrices = async () => {
    setImportError('');
    setImportStatus('');
    if (!candidates.length) {
      setImportError('Нет кандидатов для установки цены');
      return;
    }
    console.log('[ActionItems] import click', {
      candidatesCount: candidates.length,
      minMarkup: calculations.minMarkup,
      discount: calculations.discount,
      tax: calculations.tax,
      commission: calculations.commission
    });
    const eligible = candidates
      .map((raw) => calcRow(raw))
      .filter((item) => {
        const marginVal = Number(item?.margin_cost);
        return Number.isFinite(marginVal) && marginVal >= calculations.minMarkup;
      });

    console.log('[ActionItems] eligible after filter', eligible.length);

    const pricesPayload = eligible
      .map((item) => {
        const priceValue = Number(item?.my_action_price);
        if (!Number.isFinite(priceValue) || priceValue <= 0) {
          return null;
        }
        return {
          auto_action_enabled: 'UNKNOWN',
          auto_add_to_ozon_actions_list_enabled: 'UNKNOWN',
          currency_code: 'RUB',
          manage_elastic_boosting_through_price: true,
          min_price: String(priceValue),
          min_price_for_auto_actions_enabled: true,
          offer_id: item?.offer_id || null,
          old_price: Number.isFinite(item?.price) ? String(item.price) : String(priceValue),
          price: String(priceValue),
          price_strategy_enabled: 'UNKNOWN',
          product_id: item?.product_id || item?.id || null,
          vat: '0'
        };
      })
      .filter(Boolean);

    if (!pricesPayload.length) {
      setImportError('Нет подходящих товаров по условию наценки');
      console.log('[ActionItems] payload empty after map');
      return;
    }

    setImportLoading(true);
    try {
      const response = await fetch('/api/products/import-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prices: pricesPayload,
          profileId: currentProfile?.id
        })
      });
      const data = await response.json();
      if (!response.ok || data?.error) {
        throw new Error(data?.error || 'Не удалось отправить цены');
      }
      await persistPricingSettings();
      setImportStatus(`Отправлено в OZON: ${pricesPayload.length}`);
      setTimeout(() => {
        refreshData();
      }, 3000);
    } catch (err) {
      console.error('[ActionItems] import prices error', err);
      setImportError(err.message || 'Не удалось отправить цены');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportPricesElastic = async () => {
    if (!actionTitle || !actionTitle.toLowerCase().includes('эластичный')) {
      setImportError('Эта кнопка доступна только для акций с «Эластичный» в названии');
      return;
    }
    setElasticLoading(true);
    await handleImportPrices();
    setElasticLoading(false);
  };

  const renderTable = (title, items, hideKeys = []) => {
    const visibleColumns = columns.filter((col) => !col.hidden && !hideKeys.includes(col.key));
    return (
      <div>
        <h3 className="oz-card-title">
          {title} ({items.length})
        </h3>
        <div className="oz-table-wrapper oz-table-wrapper--sticky">
          <table className="oz-table">
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col.key} style={{ position: 'sticky', top: 0, backgroundColor: '#f3f4f6' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((raw, index) => {
                const item = calcRow(raw);
                const marginVal = Number(item?.margin_cost);
                const isBelowMinMarkup =
                  Number.isFinite(marginVal) && marginVal < calculations.minMarkup;
                return (
                  <tr
                    key={item.product_id || item.id || `row-${index}`}
                    className={isBelowMinMarkup ? 'oz-alert-error' : ''}
                    style={{
                      backgroundColor: isBelowMinMarkup ? '#fee2e2' : undefined,
                      color: isBelowMinMarkup ? '#b91c1c' : undefined
                    }}
                  >
                    {visibleColumns.map((col) => {
                      const value = item[col.key];
                      const content = col.format ? col.format(value) : formatNumber(value);
                      return (
                        <td key={col.key}>
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!items.length && (
                <tr>
                  <td colSpan={visibleColumns.length} className="oz-empty">
                    Нет данных
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="oz-page">
      <div className="oz-main">
        <div className="oz-breadcrumb" >
          <Link href="/" passHref>
              ← На главную
          </Link>
          <Link href="/actions" passHref>
              ← Назад к акциям
          </Link>
        </div>

        <div className="oz-page-title-block">
          <h1 className="oz-page-title">
            Товары акции {actionTitle ? `«${actionTitle}»` : `#${actionId}`}
          </h1>
        </div>
      <div className="oz-card">
          <div className="oz-card-body">
            <div className="oz-filters-grid">
              <div className="oz-form-group">
                <label className="oz-label">Минимальная наценка %</label>
                <input
                  className="oz-input"
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={minMarkup}
                  onChange={(e) => setMinMarkup(e.target.value)}
                  style={{ width: 140 }}
                />
              </div>
              <div className="oz-form-group">
                <label className="oz-label">Налоги %</label>
                <input
                  className="oz-input"
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                  style={{ width: 140 }}
                />
              </div>
              <div className="oz-form-group">
                <label className="oz-label">Комиссия Озон %</label>
                <input
                  className="oz-input"
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(e.target.value)}
                  style={{ width: 140 }}
                />
              </div>
              <div className="oz-form-group">
                <label className="oz-label">Скидка %</label>
                <input
                  className="oz-input"
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  style={{ width: 140 }}
                />
              </div>
            </div>
          </div>
        </div>
      {error && <div className="oz-alert oz-alert-error">{error}</div>}
        {loading && <div className="oz-empty">Загрузка…</div>}
      {!loading && !error && (
        <>
          <div className="oz-actions">
              <button
                className={`oz-btn ${
                  importLoading ||
                  elasticLoading ||
                  (actionTitle && actionTitle.toLowerCase().includes('эластичный'))
                    ? 'oz-btn-disabled'
                    : 'oz-btn-success'
                }`}
                type="button"
                onClick={handleImportPrices}
                disabled={
                  importLoading ||
                  elasticLoading ||
                  (actionTitle && actionTitle.toLowerCase().includes('эластичный'))
                }
              >
                {importLoading ? 'Отправляем…' : 'В акцию (установить цены)'}
              </button>
              <button
                className={`oz-btn ${
                  importLoading ||
                  elasticLoading ||
                  !actionTitle?.toLowerCase().includes('эластичный')
                    ? 'oz-btn-disabled'
                    : ''
                }`}
                type="button"
                onClick={handleImportPricesElastic}
                disabled={
                  importLoading ||
                  elasticLoading ||
                  !actionTitle?.toLowerCase().includes('эластичный')
                }
                style={{
                  backgroundColor:
                    importLoading ||
                    elasticLoading ||
                    !actionTitle?.toLowerCase().includes('эластичный')
                      ? undefined
                      : '#7c3aed',
                  color: '#fff'
                }}
              >
                {elasticLoading ? 'Отправляем…' : 'В акцию (Эластичный бустинг)'}
              </button>
              {importStatus && <span style={{ color: '#047857' }}>{importStatus}</span>}
              {importError && <span style={{ color: '#b91c1c' }}>{importError}</span>}
              <button
                className={`oz-btn ${loading ? 'oz-btn-disabled' : ''}`}
                type="button"
                onClick={refreshData}
                disabled={loading}
                style={{
                  backgroundColor: loading ? undefined : '#0ea5e9',
                  color: '#fff'
                }}
              >
                {loading ? 'Обновляем…' : 'Обновить данные'}
              </button>
            </div>

            <div className="oz-segmented-control">
              <button
                className={`oz-segmented-item ${
                  activeTab === 'candidates' ? 'oz-segmented-item--active' : ''
                }`}
                type="button"
                onClick={() => setActiveTab('candidates')}
              >
                Кандидаты ({candidates.length})
              </button>
              <button
                className={`oz-segmented-item ${
                  activeTab === 'participants' ? 'oz-segmented-item--active' : ''
                }`}
                type="button"
                onClick={() => setActiveTab('participants')}
              >
                Участвуют ({participants.length})
              </button>
            </div>

            <div className="oz-card">
              <div className="oz-card-body">
                {activeTab === 'candidates' &&
                  renderTable('Кандидаты', candidates, ['action_price', 'add_mode'])}
                {activeTab === 'participants' && renderTable('Участвуют', participants)}
              </div>
            </div>
        </>
      )}
    </div></div>
  );
}

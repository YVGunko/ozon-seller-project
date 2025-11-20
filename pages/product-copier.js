import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ProfileManager } from '../src/utils/profileManager';
import { apiClient } from '../src/services/api-client';
import { useProductAttributes } from '../src/hooks/useProductAttributes';
import { getAttributeKey } from '../src/utils/attributesHelpers';
import {
  REQUIRED_BASE_FIELDS,
  BASE_FIELD_LABELS
} from '../src/constants/productFields';
import {
  clampImageListToLimit,
  normalizePrimaryImage,
  ensureImagesPresent
} from '../src/utils/imageHelpers';

const pageStyle = {
  fontFamily: 'Arial, sans-serif',
  padding: 20,
  maxWidth: 1200,
  margin: '0 auto'
};

const sectionStyle = {
  backgroundColor: '#f9fafb',
  padding: '16px 20px',
  borderRadius: 12,
  marginBottom: '18px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
};

const buttonStyle = {
  padding: '10px 18px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer'
};

const createReplacementId = () =>
  `cop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const tokenize = (value) => {
  if (!value) return [];
  const matches = value.match(/[A-Za-zА-Яа-я0-9]+|[^\sA-Za-zА-Яа-я0-9]+/g);
  if (!matches) return [value];
  return matches.map((token) => token.trim()).filter(Boolean);
};

const deriveRules = (sampleOffer, targetOffer) => {
  if (!sampleOffer || !targetOffer) {
    return [
      {
        id: createReplacementId(),
        from: sampleOffer,
        to: targetOffer
      }
    ];
  }
  if (sampleOffer === targetOffer) {
    return [];
  }
  const sampleTokens = tokenize(sampleOffer);
  const targetTokens = tokenize(targetOffer);
  const length = Math.max(sampleTokens.length, targetTokens.length);
  const rules = [];
  for (let i = 0; i < length; i += 1) {
    const from = sampleTokens[i];
    const to = targetTokens[i];
    if (!from && to) {
      rules.push({ id: createReplacementId(), from: '', to });
      continue;
    }
    if (from && !to) {
      rules.push({ id: createReplacementId(), from, to: '' });
      continue;
    }
    if (from && to && from !== to) {
      rules.push({ id: createReplacementId(), from, to });
    }
  }
  return rules;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const applyReplacements = (text, replacements = []) => {
  if (!text) return text;
  let result = String(text);
  replacements.forEach((replacement) => {
    const from = replacement.from ?? '';
    const to = replacement.to ?? '';
    if (!from) return;
    const pattern = new RegExp(escapeRegExp(from), 'gi');
    result = result.replace(pattern, to);
  });
  return result;
};

const stringifyAttributeValues = (attribute) => {
  if (!attribute) return '';
  const values = Array.isArray(attribute.values) ? attribute.values : [];
  return values
    .map((entry) => {
      if (!entry) return '';
      if (typeof entry === 'string') return entry;
      return (
        entry.value ??
        entry.text ??
        entry.value_text ??
        entry.name ??
        ''
      );
    })
    .filter(Boolean)
    .join(', ');
};

const transformAttributes = (attributes = [], replacements = [], attributeMetaMap = new Map()) => {
  const nextAttributes = [];
  const diffs = [];
  attributes.forEach((attribute) => {
    const clone = JSON.parse(JSON.stringify(attribute));
    const attrKey = getAttributeKey(attribute?.id ?? attribute?.attribute_id) || '';
    const originalText = stringifyAttributeValues(attribute);
    if (Array.isArray(clone.values)) {
      clone.values = clone.values.map((entry) => {
        if (!entry) return entry;
        if (typeof entry === 'string') {
          const replaced = applyReplacements(entry, replacements);
          return replaced !== entry ? { value: replaced } : entry;
        }
        const rawValue =
          entry.value ??
          entry.text ??
          entry.value_text ??
          entry.name ??
          '';
        if (!rawValue) return entry;
        const replaced = applyReplacements(rawValue, replacements);
        if (replaced === rawValue) return entry;
        return { value: replaced };
      });
    }
    const nextText = stringifyAttributeValues(clone);
    if (originalText !== nextText) {
      const meta = attributeMetaMap.get(attrKey);
      diffs.push({
        attributeId: clone.id ?? clone.attribute_id ?? clone.attributeId,
        label: meta?.name || attribute.name || `ID ${attrKey || '—'}`,
        from: originalText,
        to: nextText
      });
    }
    nextAttributes.push(clone);
  });
  return { nextAttributes, diffs };
};

export default function ProductCopierPage() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [sampleOffer, setSampleOffer] = useState('');
  const [sampleAttributes, setSampleAttributes] = useState(null);
  const [sampleError, setSampleError] = useState('');
  const [loadingSample, setLoadingSample] = useState(false);
  const [offersInput, setOffersInput] = useState('');
  const [targetItems, setTargetItems] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [baseOverrides, setBaseOverrides] = useState({
    price: '',
    old_price: '',
    min_price: '',
    net_price: ''
  });
  const [selectedImages, setSelectedImages] = useState([]);
  const [previewItems, setPreviewItems] = useState([]);
  const [previewError, setPreviewError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState({ message: '', error: '' });

  const { loadAttributes } = useProductAttributes(apiClient, currentProfile);

  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  const handleLoadSample = async () => {
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль на главной странице');
      return;
    }
    if (!sampleOffer.trim()) {
      setSampleError('Введите артикул образца');
      return;
    }
    const trimmed = sampleOffer.trim();
    setSampleError('');
    setLoadingSample(true);
    setSampleAttributes(null);
    try {
      const result = await loadAttributes(trimmed);
      const product =
        (result?.response?.result && result.response.result[0]) ||
        (result?.editable && result.editable[0]) ||
        null;
      if (!product) {
        setSampleError('Товар не найден');
      } else {
        try {
          const infoParams = new URLSearchParams({
            offer_id: trimmed,
            profileId: currentProfile.id
          });
          const infoResponse = await fetch(`/api/products/info-list?${infoParams.toString()}`);
          if (infoResponse.ok) {
            const infoData = await infoResponse.json();
            const infoItem =
              (Array.isArray(infoData?.items) && infoData.items[0]) ||
              (Array.isArray(infoData?.raw?.items) && infoData.raw.items[0]) ||
              null;
            if (infoItem) {
              const pickValue = (...values) =>
                values.find((value) => value !== undefined && value !== null && value !== '') ?? '';
              const resolvedPrice = pickValue(infoItem.price, infoItem.price_value, product.price);
              const resolvedOldPrice = pickValue(
                infoItem.old_price,
                infoItem.old_price_value,
                product.old_price
              );
              const resolvedNetPrice = pickValue(
                infoItem.net_price,
                infoItem.netPrice,
                product.net_price
              );
              let resolvedMinPrice = pickValue(
                infoItem.min_price,
                infoItem.min_price_value,
                product.min_price
              );
              if (!resolvedMinPrice && resolvedPrice) {
                const numericPrice = Number(resolvedPrice);
                if (!Number.isNaN(numericPrice) && Number.isFinite(numericPrice)) {
                  const calculated = Math.max(Math.floor(numericPrice * 0.95), 0);
                  resolvedMinPrice = String(calculated);
                }
              }
              resolvedMinPrice = resolvedMinPrice || resolvedPrice;
              product.price = resolvedPrice;
              product.old_price = resolvedOldPrice;
              product.net_price = resolvedNetPrice;
              product.min_price = resolvedMinPrice;
              product.depth = infoItem.depth ?? infoItem.length ?? product.depth;
              product.width = infoItem.width ?? product.width;
              product.height = infoItem.height ?? product.height;
              product.dimension_unit = infoItem.dimension_unit ?? product.dimension_unit;
              product.weight = infoItem.weight ?? infoItem.package_weight ?? product.weight;
              product.weight_unit = infoItem.weight_unit ?? infoItem.package_weight_unit ?? product.weight_unit;
              product.description_category_id = infoItem.description_category_id ?? product.description_category_id;
            }
          }
        } catch (infoError) {
          console.error('Copier: failed to fetch info-list', infoError);
        }
        setSampleAttributes(product);
        const ensureString = (value) => (value === undefined || value === null ? '' : String(value));
        setBaseOverrides({
          price: ensureString(product.price),
          old_price: ensureString(product.old_price),
          min_price: ensureString(product.min_price),
          net_price: ensureString(product.net_price)
        });
        const images = Array.isArray(product.images) ? product.images : [];
        setSelectedImages(images.map((img) => img));
      }
    } catch (err) {
      console.error('Failed to load sample product', err);
      setSampleError(err.message || 'Не удалось загрузить образец');
    } finally {
      setLoadingSample(false);
    }
  };

  const fetchTargetInfo = async (offerId) => {
    const params = new URLSearchParams({
      offer_id: offerId,
      profileId: currentProfile.id
    });
    const response = await fetch(`/api/products/info-list?${params.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Не удалось получить сведения о товаре');
    }
    const data = await response.json();
    const item =
      (Array.isArray(data?.items) && data.items[0]) ||
      (Array.isArray(data?.raw?.items) && data.raw.items[0]) ||
      null;
    if (!item) {
      throw new Error('Товар не найден в info-list');
    }
    const productId = item?.id ?? item?.product_id ?? item?.productId;
    if (!productId) {
      throw new Error('product_id не найден');
    }
    return {
      productId: String(productId),
      offerId: offerId
    };
  };

  const handleOffersParse = async () => {
    if (!currentProfile) {
      alert('Выберите профиль');
      return;
    }
    const lines = offersInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const unique = Array.from(new Set(lines));
    if (!unique.length) {
      setTargetItems([]);
      return;
    }
    setTargetsLoading(true);
    const results = [];
    for (const offer of unique) {
      try {
        const info = await fetchTargetInfo(offer);
        results.push({ ...info, error: null });
      } catch (err) {
        console.error('Target fetch error', err);
        results.push({ offerId: offer, productId: null, error: err.message || 'Ошибка' });
      }
    }
    setTargetItems(results);
    setTargetsLoading(false);
  };

  useEffect(() => {
    if (!sampleOffer.trim() || !targetItems.length) {
      setRules([]);
      return;
    }
    const trimmed = sampleOffer.trim();
    const validTargets = targetItems.filter((item) => item.productId);
    setRules((prev) => {
      const mapped = validTargets.map((target) => {
        const existing = prev.find((rule) => rule.targetOffer === target.offerId && rule.productId === target.productId);
        if (existing) {
          return existing;
        }
        return {
          sample: trimmed,
          targetOffer: target.offerId,
          productId: target.productId,
          replacements: deriveRules(trimmed, target.offerId)
        };
      });
      return mapped;
    });
  }, [sampleOffer, targetItems]);

  const handleReplacementFieldChange = (targetOffer, replacementId, field, value) => {
    setRules((prevRules) =>
      prevRules.map((rule) => {
        if (rule.targetOffer !== targetOffer) return rule;
        return {
          ...rule,
          replacements: rule.replacements.map((replacement) =>
            replacement.id === replacementId
              ? { ...replacement, [field]: value }
              : replacement
          )
        };
      })
    );
  };

  const handleAddReplacement = (targetOffer) => {
    setRules((prevRules) =>
      prevRules.map((rule) => {
        if (rule.targetOffer !== targetOffer) return rule;
        return {
          ...rule,
          replacements: [
            ...rule.replacements,
            { id: createReplacementId(), from: '', to: '' }
          ]
        };
      })
    );
  };

  const handleRemoveReplacement = (targetOffer, replacementId) => {
    setRules((prevRules) =>
      prevRules.map((rule) => {
        if (rule.targetOffer !== targetOffer) return rule;
        return {
          ...rule,
          replacements: rule.replacements.filter((replacement) => replacement.id !== replacementId)
        };
      })
    );
  };

  const availableAttributesMap = (sampleAttributes &&
    new Map(
      (sampleAttributes.available_attributes || []).map((meta) => [
        getAttributeKey(meta?.id ?? meta?.attribute_id) || '',
        meta
      ])
    )) ||
    new Map();

  const handleGeneratePreview = () => {
    if (!sampleAttributes) {
      setPreviewError('Сначала загрузите образец');
      return;
    }
    if (!rules.length) {
      setPreviewError('Нет товаров для копирования');
      return;
    }
    if (!selectedImages.length) {
      setPreviewError('Выберите изображения для копирования');
      return;
    }
    const baseName = sampleAttributes.name || '';
    const baseDescription = sampleAttributes.description || '';
    const baseOffer = sampleAttributes.offer_id || '';
    const sourceAttributes = Array.isArray(sampleAttributes.attributes)
      ? sampleAttributes.attributes
      : [];
    const resolvedBaseFields = REQUIRED_BASE_FIELDS.reduce((acc, field) => {
      const override = baseOverrides[field]?.trim();
      const fallback = sampleAttributes[field];
      acc[field] = override || fallback || '';
      return acc;
    }, {});
    const netPriceValue =
      baseOverrides.net_price?.trim() !== ''
        ? baseOverrides.net_price
        : sampleAttributes.net_price ?? '';
    resolvedBaseFields.net_price = netPriceValue;
    try {
      const ensuredImages = ensureImagesPresent(selectedImages, 'образца');
      const nextPreview = rules.map((rule) => {
        const replacements = (rule.replacements || []).filter(
          (replacement) => replacement.from || replacement.to
        );
        const appliedName = applyReplacements(baseName, replacements);
        const appliedDescription = applyReplacements(baseDescription, replacements);
        const appliedOffer = baseOffer ? applyReplacements(baseOffer, replacements) : rule.targetOffer;
        const { nextAttributes, diffs } = transformAttributes(
          sourceAttributes,
          replacements,
          availableAttributesMap
        );
        const payload = JSON.parse(JSON.stringify(sampleAttributes));
        payload.product_id = rule.productId;
        payload.offer_id = rule.targetOffer;
        payload.name = appliedName || rule.targetOffer;
        payload.description = appliedDescription;
        payload.attributes = nextAttributes;
        Object.entries(resolvedBaseFields).forEach(([field, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            payload[field] = value;
          }
        });
        payload.images = ensuredImages;
        payload.primary_image = normalizePrimaryImage(payload.primary_image || ensuredImages[0]);
        return {
          productId: rule.productId,
          offer_id: rule.targetOffer,
          new_offer_id: appliedOffer,
          replacements,
          attributeDiffs: diffs,
          productPayload: payload
        };
      });
      setPreviewItems(nextPreview);
      setPreviewError('');
    } catch (err) {
      setPreviewError(err.message || 'Ошибка при подготовке предпросмотра');
      setPreviewItems([]);
    }
  };

  const handleImport = async () => {
    if (!currentProfile) {
      alert('Выберите профиль');
      return;
    }
    if (!previewItems.length) {
      alert('Нет товаров для импорта');
      return;
    }
    let items = [];
    try {
      items = previewItems.map((item) => {
        const clone = JSON.parse(JSON.stringify(item.productPayload));
        delete clone.product_id;
        delete clone.productId;
        delete clone.id;
        delete clone.barcode;
        delete clone.barcodes;
        REQUIRED_BASE_FIELDS.forEach((field) => {
          const value = clone[field];
          clone[field] = value !== undefined && value !== null ? String(value) : '';
          if (!clone[field]) {
            throw new Error(
              `Поле ${BASE_FIELD_LABELS[field] || field} не заполнено для товара ${item.offer_id}`
            );
          }
        });
        clone.images = ensureImagesPresent(clone.images, item.offer_id);
        clone.primary_image = normalizePrimaryImage(clone.primary_image || clone.images[0]);
        clone.attributes = (clone.attributes || []).map((attr) => ({
          id: Number(attr?.id ?? attr?.attribute_id ?? attr?.attributeId),
          values: attr.values
        }));
        return {
          product_id: item.productId,
          offer_id: item.offer_id,
          ...clone
        };
      });
    } catch (validationError) {
      setImportStatus({
        message: '',
        error: validationError.message || 'Заполните обязательные поля'
      });
      return;
    }

    setImporting(true);
    setImportStatus({ message: 'Отправляем товары…', error: '' });
    try {
      const response = await fetch('/api/products/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          profileId: currentProfile.id,
          mode: 'import'
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка при импорте');
      }
      if (data?.status_check?.error) {
        setImportStatus({ message: '', error: data.status_check.error });
      } else {
        setImportStatus({
          message: data?.status_check?.message || 'Импорт отправлен. Проверьте статус в логах.',
          error: ''
        });
      }
    } catch (err) {
      console.error('copy import error', err);
      setImportStatus({
        message: '',
        error: err.message || 'Не удалось отправить товары'
      });
    } finally {
      setImporting(false);
    }
  };

  const toggleImageSelection = (url) => {
    setSelectedImages((prev) => {
      if (prev.includes(url)) {
        return prev.filter((image) => image !== url);
      }
      return [...prev, url];
    });
  };

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" legacyBehavior>
          <a style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14 }}>← На главную</a>
        </Link>
      </div>
      <h1 style={{ marginBottom: 10 }}>Копирование товаров по образцу</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>
        Обновляйте существующие карточки, копируя характеристики образца и заменяя отличия.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>1. Образец</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Например, Viper 75W H7"
            value={sampleOffer}
            onChange={(e) => setSampleOffer(e.target.value)}
            style={{ flex: '1 1 240px', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
          />
          <button
            type="button"
            onClick={handleLoadSample}
            disabled={!sampleOffer.trim() || loadingSample}
            style={{
              ...buttonStyle,
              backgroundColor: '#3b82f6',
              color: '#fff',
              minWidth: 160
            }}
          >
            {loadingSample ? 'Загружаем…' : 'Загрузить образец'}
          </button>
        </div>
        {sampleError && <div style={{ color: '#b91c1c' }}>{sampleError}</div>}
        {sampleAttributes && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              backgroundColor: '#f8fafc'
            }}
          >
            <div style={{ fontWeight: 'bold' }}>Образец:</div>
            <div>Артикул: {sampleAttributes.offer_id}</div>
            <div>Название: {sampleAttributes.name}</div>
            <div>ID в OZON: {sampleAttributes.id}</div>
          </div>
        )}
      </section>

      {sampleAttributes && (
        <section style={sectionStyle}>
          <h2 style={{ margin: '0 0 10px' }}>2. Параметры образца</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 20
          }}>
            {['price', 'old_price', 'min_price', 'net_price'].map((field) => (
              <div key={field}>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                  {BASE_FIELD_LABELS[field] || field}
                </label>
                <input
                  type="text"
                  value={baseOverrides[field]}
                  onChange={(e) =>
                    setBaseOverrides((prev) => ({
                      ...prev,
                      [field]: e.target.value
                    }))
                  }
                  style={{
                    width: '100%',
                    padding: 8,
                    borderRadius: 6,
                    border: '1px solid #d1d5db'
                  }}
                />
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Изображения</div>
            {Array.isArray(sampleAttributes.images) && sampleAttributes.images.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {sampleAttributes.images.map((url) => (
                  <label
                    key={url}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: 6,
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      width: 120
                    }}
                  >
                    <img
                      src={url}
                      alt="img"
                      style={{ width: '100%', height: 60, objectFit: 'cover', marginBottom: 6 }}
                    />
                    <input
                      type="checkbox"
                      checked={selectedImages.includes(url)}
                      onChange={() => toggleImageSelection(url)}
                    />
                    <span style={{ fontSize: 12 }}>использовать</span>
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ color: '#6b7280' }}>У образца нет изображений</div>
            )}
          </div>
        </section>
      )}

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>3. Список товаров для копирования</h2>
        <textarea
          placeholder={'Viper 75W H1\nViper 75W H4'}
          value={offersInput}
          onChange={(e) => setOffersInput(e.target.value)}
          style={{
            width: '100%',
            minHeight: 120,
            borderRadius: 6,
            border: '1px solid #d1d5db',
            padding: 10,
            marginBottom: 10
          }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handleOffersParse}
            disabled={targetsLoading || !offersInput.trim()}
            style={{
              ...buttonStyle,
              backgroundColor: '#10b981',
              color: '#fff'
            }}
          >
            {targetsLoading ? 'Подготовка…' : 'Разобрать список'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOffersInput('');
              setTargetItems([]);
            }}
            style={{
              ...buttonStyle,
              backgroundColor: '#f3f4f6',
              color: '#111827'
            }}
          >
            Очистить
          </button>
        </div>
        {targetItems.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong>Найдено: {targetItems.filter((item) => item.productId).length}</strong>
            <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>Артикул</th>
                  <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>Product ID</th>
                  <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #d1d5db' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {targetItems.map((item) => (
                  <tr key={item.offerId}>
                    <td style={{ padding: 6 }}>{item.offerId}</td>
                    <td style={{ padding: 6 }}>{item.productId || '—'}</td>
                    <td style={{ padding: 6, color: item.error ? '#b91c1c' : '#047857' }}>
                      {item.error ? item.error : 'Готово'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>4. Правила замены</h2>
        {rules.length === 0 ? (
          <div style={{ color: '#6b7280' }}>Добавьте товары для копирования, чтобы увидеть правила.</div>
        ) : (
          rules.map((rule) => (
            <div
              key={rule.targetOffer}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
                {rule.targetOffer} (Product ID: {rule.productId})
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <th style={{ padding: 6, textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Искать</th>
                    <th style={{ padding: 6, textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Заменить на</th>
                    <th style={{ width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {rule.replacements.map((replacement) => (
                    <tr key={replacement.id}>
                      <td style={{ padding: 6, borderBottom: '1px solid #f3f4f6' }}>
                        <input
                          type="text"
                          value={replacement.from}
                          onChange={(e) => handleReplacementFieldChange(rule.targetOffer, replacement.id, 'from', e.target.value)}
                          style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }}
                        />
                      </td>
                      <td style={{ padding: 6, borderBottom: '1px solid #f3f4f6' }}>
                        <input
                          type="text"
                          value={replacement.to}
                          onChange={(e) => handleReplacementFieldChange(rule.targetOffer, replacement.id, 'to', e.target.value)}
                          style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }}
                        />
                      </td>
                      <td style={{ padding: 6, textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveReplacement(rule.targetOffer, replacement.id)}
                          style={{
                            padding: 6,
                            borderRadius: 4,
                            border: '1px solid #d1d5db',
                            backgroundColor: '#fff'
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => handleAddReplacement(rule.targetOffer)}
                style={{
                  ...buttonStyle,
                  marginTop: 8,
                  backgroundColor: '#f3f4f6',
                  color: '#111827'
                }}
              >
                Добавить правило
              </button>
            </div>
          ))
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>5. Предпросмотр</h2>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            onClick={handleGeneratePreview}
            style={{
              ...buttonStyle,
              backgroundColor: '#2563eb',
              color: '#fff'
            }}
          >
            Сформировать предпросмотр
          </button>
          <button
            type="button"
            onClick={() => {
              setPreviewItems([]);
              setPreviewError('');
            }}
            style={{
              ...buttonStyle,
              backgroundColor: '#f3f4f6',
              color: '#111827'
            }}
          >
            Очистить
          </button>
        </div>
        {previewError && <div style={{ color: '#b91c1c' }}>{previewError}</div>}
        {previewItems.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {previewItems.map((item) => (
              <div
                key={`${item.productId}-${item.offer_id}`}
                style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, backgroundColor: '#fff' }}
              >
                <div style={{ fontSize: 13, color: '#6b7280' }}>Product ID</div>
                <div style={{ fontWeight: 'bold' }}>{item.productId}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>Артикул</div>
                <div style={{ fontWeight: 'bold' }}>{item.offer_id}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>Новое название</div>
                <div style={{ fontWeight: 'bold' }}>{item.productPayload.name}</div>
                {item.attributeDiffs && item.attributeDiffs.length > 0 && (
                  <div style={{ fontSize: 13, color: '#374151', marginTop: 8 }}>
                    Изменения:
                    <ul style={{ margin: '4px 0 0 18px' }}>
                      {item.attributeDiffs.map((diff, idx) => (
                        <li key={`${diff.attributeId}-${idx}`}>
                          <strong>{diff.label}</strong>: «{diff.to || '—'}»
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#6b7280' }}>Сформируйте предпросмотр, чтобы увидеть изменения.</div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>6. Импорт</h2>
        <button
          type="button"
          onClick={handleImport}
          disabled={!previewItems.length || importing}
          style={{
            ...buttonStyle,
            minWidth: 200,
            backgroundColor: !previewItems.length || importing ? '#d1d5db' : '#059669',
            color: '#fff',
            cursor: !previewItems.length || importing ? 'not-allowed' : 'pointer'
          }}
        >
          {importing ? 'Отправляем…' : 'Копировать данные'}
        </button>
        {importStatus.message && <div style={{ color: '#047857', marginTop: 10 }}>{importStatus.message}</div>}
        {importStatus.error && <div style={{ color: '#b91c1c', marginTop: 10 }}>{importStatus.error}</div>}
      </section>
    </div>
  );
}

// pages/products.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { ProfileManager } from '../src/utils/profileManager';
import { apiClient } from '../src/services/api-client';

const LARGE_TEXT_ATTRIBUTE_IDS = new Set(['4191', '7206', '22232', '4180']);
const TYPE_ATTRIBUTE_ID = '8229';
const TYPE_ATTRIBUTE_NUMERIC = Number(TYPE_ATTRIBUTE_ID);

const getAttributeKey = (value) => {
  if (value === undefined || value === null) return null;
  return String(value);
};

const normalizeProductAttributes = (products = []) => {
  return products.map((product) => {
    const availableAttributes = Array.isArray(product?.available_attributes)
      ? product.available_attributes
      : [];
    const existingAttributes = Array.isArray(product?.attributes)
      ? product.attributes
      : [];
    const usedAttributeKeys = new Set();

    const mergedAttributes = availableAttributes
      .map((meta) => {
        const attrKey = getAttributeKey(meta?.id ?? meta?.attribute_id);
        if (!attrKey) return null;

        const existingMatch = existingAttributes.find(
          (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
        );

        if (existingMatch) {
          usedAttributeKeys.add(attrKey);
          return {
            ...existingMatch,
            id: existingMatch.id ?? existingMatch.attribute_id ?? attrKey
          };
        }

        return {
          id: meta.id ?? attrKey,
          values: []
        };
      })
      .filter(Boolean);

    existingAttributes.forEach((attr) => {
      const attrKey = getAttributeKey(attr?.id ?? attr?.attribute_id);
      if (!attrKey || usedAttributeKeys.has(attrKey)) return;

      mergedAttributes.push({
        ...attr,
        id: attr.id ?? attr.attribute_id ?? attrKey
      });
    });

    const syncedAttributes = syncTypeAttributeWithTypeId(mergedAttributes, product?.type_id);

    return {
      ...product,
      attributes: syncedAttributes
    };
  });
};

const attributeHasValues = (attribute) => {
  if (!attribute || !Array.isArray(attribute.values)) return false;
  return attribute.values.some((valueEntry) => {
    const raw =
      valueEntry?.value ??
      valueEntry?.text ??
      valueEntry?.value_text ??
      '';
    return String(raw || '').trim().length > 0;
  });
};

const createTypeAttributeValue = (typeValue) => {
  if (typeValue === undefined || typeValue === null) return null;
  const str = String(typeValue).trim();
  if (!str) return null;

  const numericValue = Number(str);
  return {
    value: str,
    dictionary_value_id: Number.isFinite(numericValue) ? numericValue : undefined
  };
};

const syncTypeAttributeWithTypeId = (attributes = [], typeIdValue, options = {}) => {
  const { force = false } = options;
  const attrKey = TYPE_ATTRIBUTE_ID;

  const normalizedAttributes = Array.isArray(attributes)
    ? attributes.map((attr) => ({ ...attr }))
    : [];

  const attrIndex = normalizedAttributes.findIndex(
    (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
  );

  const typeAttributeValue = createTypeAttributeValue(typeIdValue);

  if (attrIndex === -1) {
    if (!typeAttributeValue) {
      return normalizedAttributes;
    }

    return [
      {
        id: TYPE_ATTRIBUTE_NUMERIC,
        values: [typeAttributeValue],
        __from_type_id: true
      },
      ...normalizedAttributes
    ];
  }

  const currentAttribute = normalizedAttributes[attrIndex];
  const hasOwnValue = attributeHasValues(currentAttribute);

  if (!force && hasOwnValue) {
    return normalizedAttributes;
  }

  normalizedAttributes[attrIndex] = {
    ...currentAttribute,
    values: typeAttributeValue ? [typeAttributeValue] : [],
    __from_type_id: true
  };

  return normalizedAttributes;
};

const formatAttributeValues = (values = []) => {
  return values
    .map((entry) => entry?.value ?? entry?.text ?? entry?.value_text ?? '')
    .filter(Boolean)
    .join('\n');
};

const parseAttributeInput = (rawValue = '') => {
  return rawValue
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({ value }));
};

const getDictionaryOptionKey = (option) => {
  if (!option) return null;
  const raw =
    option?.dictionary_value_id ??
    option?.value_id ??
    option?.id ??
    option?.value ??
    option?.text;
  if (raw === undefined || raw === null || raw === '') return null;
  return String(raw);
};

const getDictionaryOptionLabel = (option) => {
  if (!option) return '';
  return (
    option?.value ??
    option?.text ??
    option?.title ??
    option?.name ??
    option?.label ??
    (option?.dictionary_value_id ? `ID ${option.dictionary_value_id}` : '')
  );
};

const buildDictionaryValueEntry = (option) => {
  const key = getDictionaryOptionKey(option);
  if (!key) return null;
  const label = getDictionaryOptionLabel(option) || key;
  const numericId = Number(key);
  const entry = {
    value: label
  };
  if (!Number.isNaN(numericId)) {
    entry.dictionary_value_id = numericId;
  } else if (
    option?.dictionary_value_id !== undefined &&
    option?.dictionary_value_id !== null
  ) {
    entry.dictionary_value_id = option.dictionary_value_id;
  }
  return entry;
};

const getDictionaryValueEntryKey = (entry, dictionaryOptionMap) => {
  if (!entry) return null;
  const rawId =
    entry?.dictionary_value_id ??
    entry?.dictionaryValueId ??
    entry?.value_id ??
    entry?.id;
  if (rawId !== undefined && rawId !== null && rawId !== '') {
    return String(rawId);
  }

  const label =
    entry?.value ??
    entry?.text ??
    entry?.value_text ??
    '';
  if (!label || !dictionaryOptionMap || dictionaryOptionMap.size === 0) {
    return null;
  }

  for (const [key, option] of dictionaryOptionMap.entries()) {
    if (getDictionaryOptionLabel(option) === label) {
      return key;
    }
  }
  return null;
};

const isDictionaryValueEntry = (entry) => {
  if (!entry) return false;
  const rawId =
    entry?.dictionary_value_id ??
    entry?.dictionaryValueId ??
    entry?.value_id ??
    entry?.id;
  return rawId !== undefined && rawId !== null && String(rawId).trim() !== '';
};

const normalizeAttributeValues = (values = []) => {
  return values
    .map((valueEntry) => {
      const rawValue =
        valueEntry?.value ??
        valueEntry?.text ??
        valueEntry?.value_text ??
        valueEntry;
      if (rawValue === undefined || rawValue === null) return null;
      const str = String(rawValue).trim();
      if (!str) return null;

      const dictionaryId =
        valueEntry?.dictionary_value_id ??
        valueEntry?.dictionaryValueId ??
        valueEntry?.value_id ??
        null;

      const payload = { value: str };
      if (
        dictionaryId !== null &&
        dictionaryId !== undefined &&
        String(dictionaryId).trim() !== ''
      ) {
        const numericId = Number(dictionaryId);
        payload.dictionary_value_id = Number.isFinite(numericId) ? numericId : dictionaryId;
      }
      return payload;
    })
    .filter(Boolean);
};

const areAttributeValuesEqual = (nextValues = [], originalValues = []) => {
  if (nextValues.length !== originalValues.length) return false;
  return nextValues.every((value, idx) => {
    const original = originalValues[idx];
    if (!original) return false;
    const sameValue = value.value === original.value;
    const nextDict = value.dictionary_value_id ?? null;
    const originalDict = original.dictionary_value_id ?? null;
    return sameValue && String(nextDict ?? '') === String(originalDict ?? '');
  });
};

export default function ProductsPage() {
  const router = useRouter();
  const autoOpenHandled = useRef(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [filters, setFilters] = useState({
    offer_id: '',
    archived: 'all',
    has_fbo_stocks: 'all',
    has_fbs_stocks: 'all',
    is_discounted: 'all'
  });
  const [pagination, setPagination] = useState({
    last_id: '',
    hasMore: true,
    limit: 20
  });

  const [attributes, setAttributes] = useState(null);
  const [editableAttributes, setEditableAttributes] = useState(null);
  const [savingAttributes, setSavingAttributes] = useState(false);
  const [attributesUpdateStatus, setAttributesUpdateStatus] = useState({ message: '', error: '' });
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyForm, setCopyForm] = useState({
    new_offer_id: '',
    name: '',
    color: '',
    description: '',
    price: '',
    old_price: ''
  });

  const [error, setError] = useState(null);

  // load profile once
  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  // fetchProducts function
  const fetchProducts = useCallback(async (reset = false) => {
    if (!currentProfile) return;
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const params = {
        limit: pagination.limit,
        last_id: !reset ? pagination.last_id : '',
        offer_id: filters.offer_id || ''
      };

      const result = await apiClient.getProducts(pagination.limit, currentProfile, params);

      if (result?.result?.items) {
        const items = result.result.items;
        setProducts(prev => reset ? items : [...prev, ...items]);
        setPagination(prev => ({
          ...prev,
          last_id: result.result.last_id || '',
          hasMore: !!result.result.last_id && items.length === prev.limit
        }));
      } else if (Array.isArray(result)) {
        setProducts(prev => reset ? result : [...prev, ...result]);
        setPagination(prev => ({ ...prev, hasMore: result.length === prev.limit }));
      } else {
        console.warn('Unexpected products response', result);
      }
    } catch (err) {
      console.error('fetchProducts error', err);
      setError(err.message || 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [currentProfile, filters.offer_id, pagination.limit, pagination.last_id, loading]);

  // Trigger loading when profile becomes available
  useEffect(() => {
    if (currentProfile) fetchProducts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfile]);

  useEffect(() => {
    if (autoOpenHandled.current) return;
    if (!currentProfile) return;

    if (typeof window === 'undefined') return;

    let offerToOpen = null;
    if (router?.query?.openAttributes === 'true' && router?.query?.offer_id) {
      offerToOpen = router.query.offer_id;
    } else {
      offerToOpen = window.localStorage.getItem('openAttributesOffer');
    }

    if (offerToOpen) {
      autoOpenHandled.current = true;
      fetchAttributes(offerToOpen);
      window.localStorage.removeItem('openAttributesOffer');
      if (router?.query?.openAttributes === 'true') {
        router.replace('/products', undefined, { shallow: true });
      }
    }
  }, [currentProfile, router]);

  // fetchAttributes
  const fetchAttributes = async (offerId) => {
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль');
      return;
    }
    setLoadingAttributes(true);
    setSelectedProduct(offerId);
    setAttributes(null);
    setEditableAttributes(null);
    setAttributesUpdateStatus({ message: '', error: '' });

    try {
      const data = await apiClient.getAttributes(offerId, currentProfile);
      const normalizedResult = normalizeProductAttributes(data?.result || []);
      const normalizedData = {
        ...data,
        result: normalizedResult
      };
      setAttributes(normalizedData);
      const editable = JSON.parse(JSON.stringify(normalizedResult));
      setEditableAttributes(editable);
    } catch (err) {
      console.error('fetchAttributes error', err);
      setAttributes({ error: err.message || 'Failed to load attributes' });
    } finally {
      setLoadingAttributes(false);
    }
  };

  const closeAttributes = () => {
    setAttributes(null);
    setSelectedProduct(null);
    setEditableAttributes(null);
    setSavingAttributes(false);
    setAttributesUpdateStatus({ message: '', error: '' });
  };

  const handleAttributeValueChange = (productIndex, attributeId, rawValue) => {
    setEditableAttributes(prev => {
      if (!prev) return prev;

      return prev.map((product, pIdx) => {
        if (pIdx !== productIndex) return product;

        const values = parseAttributeInput(rawValue);
        const attributes = Array.isArray(product.attributes)
          ? product.attributes.map(attr => ({ ...attr }))
          : [];
        const attrKey = getAttributeKey(attributeId);
        if (!attrKey) {
          return product;
        }

        const attrIndex = attributes.findIndex(
          attr => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
        );

        if (attrIndex === -1) {
          return {
            ...product,
            attributes: [
              ...attributes,
              {
                id: attributeId,
                values
              }
            ]
          };
        }

        const updatedAttributes = [...attributes];
        updatedAttributes[attrIndex] = {
          ...updatedAttributes[attrIndex],
          id: updatedAttributes[attrIndex].id ?? attributeId,
          values
        };

        return {
          ...product,
          attributes: updatedAttributes
        };
      });
    });
  };

  const handleManualValueChange = (productIndex, attributeId, rawValue) => {
    setEditableAttributes(prev => {
      if (!prev) return prev;
      const manualValues = parseAttributeInput(rawValue);

      return prev.map((product, idx) => {
        if (idx !== productIndex) return product;
        const attrKey = getAttributeKey(attributeId);
        if (!attrKey) return product;

        const attributes = Array.isArray(product.attributes)
          ? product.attributes.map(attr => ({ ...attr }))
          : [];

        const attrIndex = attributes.findIndex(
          attr => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
        );

        if (attrIndex === -1) {
          if (!manualValues.length) return product;
          return {
            ...product,
            attributes: [
              ...attributes,
              {
                id: attributeId,
                values: manualValues
              }
            ]
          };
        }

        const existingValues = Array.isArray(attributes[attrIndex].values)
          ? attributes[attrIndex].values
          : [];
        const dictionaryValues = existingValues.filter(isDictionaryValueEntry);

        const updatedAttributes = [...attributes];
        updatedAttributes[attrIndex] = {
          ...updatedAttributes[attrIndex],
          values: [...dictionaryValues, ...manualValues]
        };

        return {
          ...product,
          attributes: updatedAttributes
        };
      });
    });
  };

  const handleDictionaryValueChange = (productIndex, attributeId, selectedKeys, optionsMap) => {
    setEditableAttributes(prev => {
      if (!prev) return prev;
      const normalizedKeys = Array.isArray(selectedKeys)
        ? Array.from(new Set(selectedKeys.filter(Boolean)))
        : [];

      return prev.map((product, idx) => {
        if (idx !== productIndex) return product;
        const attrKey = getAttributeKey(attributeId);
        if (!attrKey) return product;

        const attributes = Array.isArray(product.attributes)
          ? product.attributes.map(attr => ({ ...attr }))
          : [];

        const attrIndex = attributes.findIndex(
          attr => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
        );

        const dictionaryValues = normalizedKeys
          .map((key) => {
            const option = optionsMap?.get(key);
            return option ? buildDictionaryValueEntry(option) : null;
          })
          .filter(Boolean);

        if (attrIndex === -1) {
          if (!dictionaryValues.length) return product;

          return {
            ...product,
            attributes: [
              ...attributes,
              {
                id: attributeId,
                values: dictionaryValues
              }
            ]
          };
        }

        const existingValues = Array.isArray(attributes[attrIndex].values)
          ? attributes[attrIndex].values
          : [];
        const manualValues = existingValues.filter(value => !isDictionaryValueEntry(value));

        const updatedAttributes = [...attributes];
        updatedAttributes[attrIndex] = {
          ...updatedAttributes[attrIndex],
          values: [...dictionaryValues, ...manualValues]
        };

        return {
          ...product,
          attributes: updatedAttributes
        };
      });
    });
  };

  const handleTypeIdChange = (productIndex, rawValue) => {
    setEditableAttributes(prev => {
      if (!prev) return prev;

      return prev.map((product, idx) => {
        if (idx !== productIndex) return product;

        const nextProduct = { ...product };
        const normalizedValue =
          typeof rawValue === 'string' ? rawValue.trim() : rawValue ?? '';

        nextProduct.type_id = normalizedValue;
        const syncedAttributes = syncTypeAttributeWithTypeId(
          nextProduct.attributes,
          normalizedValue,
          { force: true }
        );
        nextProduct.attributes = syncedAttributes;

        return nextProduct;
      });
    });
  };

  const sanitizeItemsForUpdate = () => {
    if (!editableAttributes || editableAttributes.length === 0) return [];

    const originalProducts = attributes?.result || [];

    return editableAttributes
      .map((item, idx) => {
        const offerId = item.offer_id || selectedProduct;
        if (!offerId) return null;

        const originalProduct = originalProducts[idx] || {};

        const attributesPayload = (item.attributes || [])
          .map(attr => {
            const id = Number(attr?.id ?? attr?.attribute_id);
            if (!id) return null;
            const values = normalizeAttributeValues(attr.values);
            if (!values.length) return null;

            const originalAttr = (originalProduct.attributes || []).find(
              original => Number(original?.id ?? original?.attribute_id) === id
            );
            const originalValues = normalizeAttributeValues(originalAttr?.values || []);

            if (areAttributeValuesEqual(values, originalValues)) {
              return null;
            }

            return {
              id,
              values
            };
          })
          .filter(Boolean);

        const typeId = Number(item.type_id ?? item.typeId);
        const originalTypeId = Number(originalProduct?.type_id ?? originalProduct?.typeId);
        const typeChanged =
          Number.isFinite(typeId) &&
          (Number.isNaN(originalTypeId) || typeId !== originalTypeId);

        if (!attributesPayload.length && !typeChanged) {
          return null;
        }

        const payload = {
          offer_id: String(offerId),
          attributes: attributesPayload
        };

        if (typeChanged) {
          payload.type_id = typeId;
        }

        if (item.name && item.name !== originalProduct.name) {
          payload.name = item.name;
        }

        return payload;
      })
      .filter(Boolean);
  };

  const saveAttributesToOzon = async () => {
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль');
      return;
    }

    if (!selectedProduct) {
      alert('Не выбран товар для обновления');
      return;
    }

    const items = sanitizeItemsForUpdate();

    if (items.length === 0) {
      alert('Нет атрибутов для отправки. Заполните значения перед сохранением.');
      return;
    }

    try {
      setSavingAttributes(true);
      setAttributesUpdateStatus({ message: '', error: '' });

      const response = await fetch('/api/products/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          profile: currentProfile
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Не удалось обновить атрибуты');
      }

      setAttributesUpdateStatus({
        message: 'Атрибуты успешно отправлены в OZON',
        error: ''
      });
    } catch (error) {
      console.error('saveAttributesToOzon error', error);
      setAttributesUpdateStatus({
        message: '',
        error: error.message || 'Ошибка при обновлении атрибутов'
      });
    } finally {
      setSavingAttributes(false);
    }
  };

  const openCopyModal = (product) => {
    setSelectedProduct(product);
    setCopyForm({
      new_offer_id: `${product.offer_id}-copy`,
      name: product.name || '',
      color: '',
      description: '',
      price: '',
      old_price: ''
    });
    setCopyModalOpen(true);
  };

  const copyProduct = async () => {
    if (!copyForm.new_offer_id) {
      alert('Пожалуйста, введите новый артикул');
      return;
    }
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль');
      return;
    }

    setCopyLoading(true);
    try {
      const modifications = {};
      if (copyForm.name && copyForm.name !== selectedProduct.name) modifications.name = copyForm.name;
      if (copyForm.color) modifications.color = copyForm.color;
      if (copyForm.description) modifications.description = copyForm.description;
      if (copyForm.price) modifications.price = copyForm.price;
      if (copyForm.old_price) modifications.old_price = copyForm.old_price;

      const result = await apiClient.copyProduct(
        selectedProduct.offer_id,
        copyForm.new_offer_id,
        modifications,
        currentProfile
      );

      console.log('copy result', result);
      alert('Товар успешно скопирован!');
      setCopyModalOpen(false);
      // обновляем список
      fetchProducts(true);
    } catch (err) {
      console.error('copyProduct error', err);
      alert('Ошибка при копировании: ' + (err.message || err));
    } finally {
      setCopyLoading(false);
    }
  };

  const applyFilters = () => {
    setProducts([]);
    setPagination(prev => ({ ...prev, last_id: '', hasMore: true }));
    fetchProducts(true);
  };

  const resetFilters = () => {
    setFilters({
      offer_id: '',
      archived: 'all',
      has_fbo_stocks: 'all',
      has_fbs_stocks: 'all',
      is_discounted: 'all'
    });
    setProducts([]);
    setPagination(prev => ({ ...prev, last_id: '', hasMore: true }));
    fetchProducts(true);
  };

  const filteredProducts = products.filter(product => {
    if (filters.archived !== 'all' && product.archived !== (filters.archived === 'true')) return false;
    if (filters.has_fbo_stocks !== 'all' && product.has_fbo_stocks !== (filters.has_fbo_stocks === 'true')) return false;
    if (filters.has_fbs_stocks !== 'all' && product.has_fbs_stocks !== (filters.has_fbs_stocks === 'true')) return false;
    if (filters.is_discounted !== 'all' && product.is_discounted !== (filters.is_discounted === 'true')) return false;
    if (filters.offer_id && product.offer_id !== filters.offer_id) return false;
    return true;
  });

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 15 }}>
        <a href="/" style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14 }}>← На главную</a>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Управление товарами OZON</h1>

        {currentProfile ? (
          <div style={{ fontSize: 14, color: '#666', textAlign: 'right' }}>
            <div style={{ fontWeight: 'bold', color: '#28a745' }}>✅ {currentProfile.name}</div>
            <div style={{ fontSize: 12 }}>Client ID: {currentProfile.ozon_client_id?.slice(0, 8)}...</div>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: '#dc3545', textAlign: 'right' }}>
            <div>⚠️ Профиль не выбран</div>
            <a href="/" style={{ fontSize: 12, color: '#0070f3' }}>Выбрать на главной</a>
          </div>
        )}
      </div>

      {/* Filters (left unchanged visually) */}
      {/* ... same filters UI from your original file ... */}
      {/* For brevity, use existing UI; they work with the new code because applyFilters/resetFilters call fetchProducts */}
      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Артикул (offer_id):
          </label>
          <input
            type="text"
            value={filters.offer_id}
            onChange={(e) => setFilters(prev => ({ ...prev, offer_id: e.target.value }))}
            placeholder="Введите артикул"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <button
            onClick={applyFilters}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Применить
          </button>
          <button
            onClick={resetFilters}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Сбросить
          </button>
        </div>
      </div>
      {/* show error */}
      {error && <div style={{ color: 'red', marginBottom: 10 }}>Ошибка: {error}</div>}

      <div style={{ marginBottom: 20, color: '#666' }}>
        Показано: {filteredProducts.length} товаров
        {products.length !== filteredProducts.length && ` (отфильтровано из ${products.length})`}
      </div>

      {/* Table — same structure, but use fetchAttributes / openCopyModal */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Product ID</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Артикул</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>В архиве</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>FBO остатки</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>FBS остатки</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Уцененный</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.product_id || product.offer_id} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: 12 }}>{product.product_id}</td>
                <td style={{ padding: 12, fontWeight: 'bold' }}>{product.offer_id}</td>
                <td style={{ padding: 12 }}>
                  <span style={{ color: product.archived ? '#dc3545' : '#28a745', fontWeight: 'bold' }}>
                    {product.archived ? 'Да' : 'Нет'}
                  </span>
                </td>
                <td style={{ padding: 12 }}>
                  <span style={{ color: product.has_fbo_stocks ? '#28a745' : '#6c757d' }}>
                    {product.has_fbo_stocks ? 'Есть' : 'Нет'}
                  </span>
                </td>
                <td style={{ padding: 12 }}>
                  <span style={{ color: product.has_fbs_stocks ? '#28a745' : '#6c757d' }}>
                    {product.has_fbs_stocks ? 'Есть' : 'Нет'}
                  </span>
                </td>
                <td style={{ padding: 12 }}>
                  <span style={{ color: product.is_discounted ? '#ffc107' : '#6c757d' }}>
                    {product.is_discounted ? 'Да' : 'Нет'}
                  </span>
                </td>
                <td style={{ padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => fetchAttributes(product.offer_id)}
                      disabled={loadingAttributes && selectedProduct === product.offer_id}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: loadingAttributes && selectedProduct === product.offer_id ? 'not-allowed' : 'pointer',
                        fontSize: 12
                      }}
                    >
                      {loadingAttributes && selectedProduct === product.offer_id ? 'Загрузка...' : 'Атрибуты'}
                    </button>
                    <button
                      onClick={() => openCopyModal(product)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontSize: 12
                      }}
                    >
                      Копировать
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#6c757d', backgroundColor: 'white' }}>
            Товары не найдены
          </div>
        )}
      </div>

      {pagination.hasMore && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => fetchProducts(false)}
            disabled={loading}
            style={{
              padding: '12px 30px',
              backgroundColor: loading ? '#6c757d' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 16
            }}
          >
            {loading ? 'Загрузка...' : 'Загрузить еще'}
          </button>
        </div>
      )}

      {!pagination.hasMore && products.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 20, color: '#6c757d', padding: 10 }}>Все товары загружены</div>
      )}

      {/* Модальные окна: атрибуты и копирование — оставлены как в твоём UI, но используют state / функции выше */}
      {attributes && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div style={{ backgroundColor: 'white', padding: 30, borderRadius: 8, maxWidth: 1400, maxHeight: '80vh', overflow: 'auto', width: '80vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Атрибуты товара: {selectedProduct}</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={saveAttributesToOzon}
                  disabled={savingAttributes || !editableAttributes || !editableAttributes.length}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: savingAttributes ? '#6c757d' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: savingAttributes ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingAttributes ? 'Отправляем...' : 'Изменить в OZON'}
                </button>
                <button
                  onClick={closeAttributes}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4
                  }}
                >
                  Закрыть
                </button>
              </div>
            </div>

            {attributesUpdateStatus.message && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  borderRadius: 6,
                  backgroundColor: '#e8f5e9',
                  color: '#2d7a32',
                  border: '1px solid #c7e6cc',
                  fontSize: 14
                }}
              >
                {attributesUpdateStatus.message}
              </div>
            )}

            {attributesUpdateStatus.error && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '10px 14px',
                  borderRadius: 6,
                  backgroundColor: '#fdecea',
                  color: '#b71c1c',
                  border: '1px solid #f5c2c0',
                  fontSize: 14
                }}
              >
                {attributesUpdateStatus.error}
              </div>
            )}

            {attributes.error ? (
              <div style={{ color: '#dc3545', padding: 20, textAlign: 'center' }}>Ошибка: {attributes.error}</div>
            ) : attributes.result && attributes.result.length > 0 ? (
              <div>
                {attributes.result.map((productInfo, idx) => {
                  const editableProduct = editableAttributes?.[idx] || productInfo;
                  const attributeList = editableProduct?.attributes || [];
                  const attributeMetaMap = new Map(
                    (productInfo.available_attributes || [])
                      .map(meta => [getAttributeKey(meta?.id ?? meta?.attribute_id), meta])
                      .filter(([key]) => !!key)
                  );
                  const typeMeta = attributeMetaMap.get(TYPE_ATTRIBUTE_ID);
                  const typeAttributeFromList = attributeList.find(
                    (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === TYPE_ATTRIBUTE_ID
                  );
                  const fallbackTypeValue = typeAttributeFromList
                    ? formatAttributeValues(typeAttributeFromList.values || [])
                    : '';
                  const typeInputRaw =
                    editableProduct?.type_id ??
                    productInfo?.type_id ??
                    fallbackTypeValue ??
                    '';
                  const typeInputValue =
                    typeInputRaw === undefined || typeInputRaw === null
                      ? ''
                      : String(typeInputRaw);

                  return (
                    <div key={idx} style={{ marginBottom: 20 }}>
                      <div style={{ marginBottom: 12, padding: 15, backgroundColor: '#f8f9fa', borderRadius: 4 }}>
                        <h3>Основная информация</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div><strong>ID:</strong> {productInfo.id}</div>
                          <div><strong>Артикул:</strong> {productInfo.offer_id}</div>
                          <div><strong>SKU:</strong> {productInfo.sku}</div>
                          <div><strong>Название:</strong> {productInfo.name}</div>
                          {productInfo.barcode && <div><strong>Штрихкод:</strong> {productInfo.barcode}</div>}
                          {productInfo.weight && <div><strong>Вес:</strong> {productInfo.weight} {productInfo.weight_unit}</div>}
                          {productInfo.description_category_id && (
                            <div><strong>Description category:</strong> {productInfo.description_category_id}</div>
                          )}
                          <div style={{ gridColumn: '1 / span 2' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                              Тип (type_id / ID {TYPE_ATTRIBUTE_ID})
                            </div>
                            <input
                              type="text"
                              value={typeInputValue}
                              onChange={(e) => handleTypeIdChange(idx, e.target.value)}
                              placeholder="Введите числовой type_id"
                              style={{
                                width: '100%',
                                padding: 8,
                                border: '1px solid #ced4da',
                                borderRadius: 4
                              }}
                            />
                            <div style={{ fontSize: 12, color: '#6c757d', marginTop: 4, lineHeight: 1.4 }}>
                              {typeMeta?.description ||
                                'Значение типа управляет принадлежностью товара к справочнику OZON.'}
                              {productInfo.type_id && String(productInfo.type_id) !== typeInputValue && (
                                <div>Текущее значение в OZON: {productInfo.type_id}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {attributeList.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <h3>Характеристики ({attributeList.length})</h3>
                          {!productInfo.available_attributes?.length && (
                            <div style={{ padding: '8px 12px', marginBottom: 10, borderRadius: 6, backgroundColor: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', fontSize: 13 }}>
                              Для данной категории не удалось получить справочник характеристик. Ниже показаны характеристики из товара.
                            </div>
                          )}
                          <div style={{ maxHeight: '55vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
                            {attributeList.map((attr, aIdx) => {
                              const attrKey = getAttributeKey(attr?.id ?? attr?.attribute_id);
                              if (!attrKey) return null;

                              const meta = attributeMetaMap.get(attrKey);
                              const metaType = (meta?.type || '').toLowerCase();
                              const isTypeAttribute = attrKey === TYPE_ATTRIBUTE_ID;
                              let dictionaryOptions = Array.isArray(meta?.dictionary_values)
                                ? meta.dictionary_values.filter(option => getDictionaryOptionKey(option))
                                : [];
                              const dictionaryOptionMap = new Map();
                              dictionaryOptions.forEach((option) => {
                                const key = getDictionaryOptionKey(option);
                                if (key && !dictionaryOptionMap.has(key)) {
                                  dictionaryOptionMap.set(key, option);
                                }
                              });
                              const hasDictionaryOptions = dictionaryOptions.length > 0 && !isTypeAttribute;
                              const manualEntries = (attr.values || []).filter(value => !isDictionaryValueEntry(value));
                              const dictionaryEntries = (attr.values || []).filter(isDictionaryValueEntry);
                              const manualValueString = formatAttributeValues(manualEntries);
                              const selectedDictionaryKeys = dictionaryEntries
                                .map(entry => getDictionaryValueEntryKey(entry, dictionaryOptionMap))
                                .filter(Boolean);
                              dictionaryEntries.forEach((entry) => {
                                const key =
                                  getDictionaryValueEntryKey(entry, dictionaryOptionMap) ||
                                  getAttributeKey(entry?.dictionary_value_id ?? entry?.value_id ?? entry?.id);
                                if (key && !dictionaryOptionMap.has(key)) {
                                  const syntheticOption = {
                                    dictionary_value_id: entry?.dictionary_value_id ?? entry?.value_id ?? entry?.id,
                                    value: getDictionaryOptionLabel({
                                      value: entry?.value ?? entry?.text ?? entry?.value_text,
                                      dictionary_value_id: entry?.dictionary_value_id ?? entry?.value_id ?? entry?.id
                                    })
                                  };
                                  dictionaryOptionMap.set(key, syntheticOption);
                                  dictionaryOptions = [...dictionaryOptions, syntheticOption];
                                }
                              });

                              const dictionarySelectValue = meta?.is_collection
                                ? selectedDictionaryKeys
                                : (selectedDictionaryKeys[0] ?? '');

                              const fallbackValueString = formatAttributeValues(attr.values || []);
                              const textareaValue = isTypeAttribute
                                ? typeInputValue
                                : hasDictionaryOptions
                                  ? manualValueString
                                  : fallbackValueString;

                              const isLargeField =
                                LARGE_TEXT_ATTRIBUTE_IDS.has(attrKey) ||
                                ['text', 'html', 'richtext'].includes(metaType);

                              const rows = isTypeAttribute ? 2 : isLargeField ? 6 : 3;
                              const textareaMinHeight = isTypeAttribute ? 60 : isLargeField ? 140 : 70;

                              const textareaProps = (() => {
                                if (isTypeAttribute) {
                                  return {
                                    onChange: (e) => handleTypeIdChange(idx, e.target.value),
                                    placeholder: 'Введите числовой type_id'
                                  };
                                }
                                if (hasDictionaryOptions) {
                                  return {
                                    onChange: (e) => handleManualValueChange(idx, attrKey, e.target.value),
                                    placeholder: 'Дополнительные значения через запятую или перенос строки'
                                  };
                                }
                                return {
                                  onChange: (e) => handleAttributeValueChange(idx, attrKey, e.target.value),
                                  placeholder: 'Введите значения через запятую или перенос строки'
                                };
                              })();

                              return (
                                <div
                                  key={`${attrKey}-${aIdx}`}
                                  style={{
                                    border: '1px solid #dee2e6',
                                    borderRadius: 8,
                                    padding: 12,
                                    backgroundColor: '#fff'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: 15, color: '#212529' }}>
                                      {meta?.name || `Атрибут #${attrKey}`}
                                      {meta?.is_required && <span style={{ color: '#dc3545', marginLeft: 6 }}>*</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#6c757d' }}>ID: {attrKey}</div>
                                  </div>
                                  {meta?.description && (
                                    <div style={{ fontSize: 12, color: '#6c757d', marginTop: 4 }}>
                                      {meta.description}
                                    </div>
                                  )}

                                  {hasDictionaryOptions && (
                                    <div style={{ marginTop: 12 }}>
                                      <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 6 }}>
                                        Значения из справочника
                                      </div>
                                      <select
                                        multiple={!!meta?.is_collection}
                                        value={dictionarySelectValue}
                                        onChange={(e) => {
                                          if (meta?.is_collection) {
                                            const selectedValues = Array.from(e.target.selectedOptions).map(option => option.value);
                                            handleDictionaryValueChange(idx, attrKey, selectedValues, dictionaryOptionMap);
                                          } else {
                                            const nextValue = e.target.value ? [e.target.value] : [];
                                            handleDictionaryValueChange(idx, attrKey, nextValue, dictionaryOptionMap);
                                          }
                                        }}
                                        style={{
                                          width: '100%',
                                          minHeight: meta?.is_collection ? 120 : 40,
                                          borderRadius: 4,
                                          border: '1px solid #ced4da',
                                          padding: 6
                                        }}
                                      >
                                        {!meta?.is_collection && <option value="">— Не выбрано —</option>}
                                        {dictionaryOptions.map((option) => {
                                          const optionKey = getDictionaryOptionKey(option);
                                          if (!optionKey) return null;
                                          return (
                                            <option key={optionKey} value={optionKey}>
                                              {getDictionaryOptionLabel(option)}
                                            </option>
                                          );
                                        })}
                                      </select>
                                      <div style={{ fontSize: 12, color: '#6c757d', marginTop: 4 }}>
                                        {meta?.is_collection
                                          ? 'Для множественного выбора удерживайте Ctrl/Cmd.'
                                          : 'Выберите значение или очистите поле для удаления.'}
                                      </div>
                                    </div>
                                  )}

                                  <textarea
                                    value={textareaValue}
                                    rows={rows}
                                    style={{
                                      width: '100%',
                                      padding: 8,
                                      border: '1px solid #ced4da',
                                      borderRadius: 4,
                                      fontSize: 13,
                                      resize: 'vertical',
                                      minHeight: textareaMinHeight,
                                      marginTop: hasDictionaryOptions ? 12 : 10
                                    }}
                                    {...textareaProps}
                                  />
                                  {hasDictionaryOptions && (
                                    <div style={{ fontSize: 11, color: '#6c757d', marginTop: 4 }}>
                                      Если нужного значения нет в списке, добавьте его вручную выше.
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 11, color: '#6c757d' }}>
                                    {meta?.type && <span>Тип: {meta.type}</span>}
                                    <span>
                                      Макс. значений:{' '}
                                      {meta?.max_value_count && meta.max_value_count > 0 ? meta.max_value_count : '∞'}
                                    </span>
                                    <span>{meta?.dictionary_id ? 'Использует справочник' : 'Ввод вручную'}</span>
                                    {meta?.is_collection && <span>Можно выбрать несколько значений</span>}
                                  </div>
                                  {isTypeAttribute && (
                                    <div style={{ fontSize: 11, color: '#6c757d', marginTop: 6 }}>
                                      Значение типа синхронизируется с полем type_id выше.
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {productInfo.images && productInfo.images.length > 0 && (
                        <div>
                          <h3>Изображения ({productInfo.images.length})</h3>
                          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
                            {productInfo.images.map((img, imIdx) => (
                              <img key={imIdx} src={img} alt={`img-${imIdx}`} style={{ height: 100, width: 'auto', border: '1px solid #ddd', borderRadius: 4 }} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: '#6c757d' }}>Атрибуты не найдены</div>
            )}
          </div>
        </div>
      )}

      {copyModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: 30, borderRadius: 8, maxWidth: 500, width: '100%' }}>
            <h2>Копировать товар</h2>
            <p>Исходный артикул: <strong>{selectedProduct?.offer_id}</strong></p>

            {/* form inputs (as before) */}
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Новый артикул *:</label>
              <input value={copyForm.new_offer_id} onChange={(e) => setCopyForm(prev => ({ ...prev, new_offer_id: e.target.value }))} placeholder="Введите новый артикул" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Название товара:</label>
              <input value={copyForm.name} onChange={(e) => setCopyForm(prev => ({ ...prev, name: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Цвет:</label>
              <input value={copyForm.color} onChange={(e) => setCopyForm(prev => ({ ...prev, color: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Описание:</label>
              <textarea value={copyForm.description} onChange={(e) => setCopyForm(prev => ({ ...prev, description: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4, minHeight: 80 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Цена:</label>
                <input value={copyForm.price} onChange={(e) => setCopyForm(prev => ({ ...prev, price: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Старая цена:</label>
                <input value={copyForm.old_price} onChange={(e) => setCopyForm(prev => ({ ...prev, old_price: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCopyModalOpen(false)} disabled={copyLoading} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: 4 }}>Отмена</button>
              <button onClick={copyProduct} disabled={copyLoading || !copyForm.new_offer_id} style={{ padding: '10px 20px', backgroundColor: copyLoading || !copyForm.new_offer_id ? '#6c757d' : '#28a745', color: 'white', border: 'none', borderRadius: 4 }}>
                {copyLoading ? 'Копирование...' : 'Создать копию'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
   );
}

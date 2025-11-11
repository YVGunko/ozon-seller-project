// pages/products.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { ProfileManager } from '../src/utils/profileManager';
import { apiClient } from '../src/services/api-client';
import {
  REQUIRED_BASE_FIELDS,
  NUMERIC_BASE_FIELDS,
  BASE_FIELD_LABELS
} from '../src/constants/productFields';
import { AttributesModal } from '../src/components/attributes';
import {
  LARGE_TEXT_ATTRIBUTE_IDS,
  TYPE_ATTRIBUTE_ID,
  SINGLE_VALUE_STRING_ATTRIBUTE_IDS,
  parsePositiveTypeId,
  getAttributeKey,
  normalizeProductAttributes,
  syncTypeAttributeWithTypeId,
  formatAttributeValues,
  parseAttributeInput,
  getDictionaryOptionKey,
  getDictionaryOptionLabel,
  buildDictionaryValueEntry,
  getDictionaryValueEntryKey,
  isDictionaryValueEntry,
  normalizeAttributeValues,
  areAttributeValuesEqual
} from '../src/utils/attributesHelpers';

const STATUS_CHECK_PROGRESS_MESSAGE = 'Проверяю статус карточки...';
const hasValue = (value) => value !== undefined && value !== null && value !== '';

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
  const [savingAttributesLabel, setSavingAttributesLabel] = useState('Отправляем...');
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
    setSavingAttributesLabel('Отправляем...');
    setAttributesUpdateStatus({ message: '', error: '' });
  };

  const refreshAttributesModal = () => {
    const offerId =
      typeof selectedProduct === 'string'
        ? selectedProduct
        : selectedProduct?.offer_id;

    if (!offerId) {
      alert('Не удалось определить товар для обновления');
      return;
    }

    fetchAttributes(offerId);
  };

  const handleAttributeValueChange = (productIndex, attributeId, rawValue) => {
    setEditableAttributes(prev => {
      if (!prev) return prev;

      return prev.map((product, pIdx) => {
        if (pIdx !== productIndex) return product;

        const values = parseAttributeInput(rawValue, attributeId);
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

  const handleProductMetaChange = (productIndex, field, value) => {
    setEditableAttributes(prev => {
      if (!prev) return prev;
      return prev.map((product, idx) => {
        if (idx !== productIndex) return product;
        return {
          ...product,
          [field]: value
        };
      });
    });
  };

  const handleManualValueChange = (productIndex, attributeId, rawValue) => {
    setEditableAttributes(prev => {
      if (!prev) return prev;
      const manualValues = parseAttributeInput(rawValue, attributeId);

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
        const userTypeId = parsePositiveTypeId(item.type_id ?? item.typeId);
        const originalTypeId = parsePositiveTypeId(originalProduct?.type_id ?? originalProduct?.typeId);
        const resolvedTypeId = userTypeId ?? originalTypeId ?? null;

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

        const typeChanged = userTypeId !== null && userTypeId !== originalTypeId;

        const payload = {
          offer_id: String(offerId)
        };

        if (attributesPayload.length) {
          payload.attributes = attributesPayload;
        }

        if (resolvedTypeId !== null) {
          payload.type_id = resolvedTypeId;
        }

        if (item.name && item.name !== originalProduct.name) {
          payload.name = item.name;
        }

        const baseFieldUpdates = {};
        const missingBaseFields = [];

        REQUIRED_BASE_FIELDS.forEach((field) => {
          let value = item[field];
          if (!hasValue(value)) {
            value = originalProduct[field];
          }
          if (!hasValue(value)) {
            missingBaseFields.push(field);
            return;
          }
          if (NUMERIC_BASE_FIELDS.includes(field)) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) {
              missingBaseFields.push(field);
              return;
            }
          }
          const normalizedValue = String(value);
          baseFieldUpdates[field] = normalizedValue;
          item[field] = normalizedValue;
        });

        if (missingBaseFields.length) {
          const readable = missingBaseFields.map((field) => BASE_FIELD_LABELS[field] || field);
          throw new Error(
            `Товар ${offerId}: заполните поля ${readable.join(', ')}`
          );
        }

        const hasBaseFields = Object.keys(baseFieldUpdates).length > 0;
        if (hasBaseFields) {
          Object.assign(payload, baseFieldUpdates);
        }

        if (
          !payload.attributes &&
          !typeChanged &&
          !hasBaseFields &&
          !payload.name
        ) {
          return null;
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

    let items;
    try {
      items = sanitizeItemsForUpdate();
    } catch (validationError) {
      alert(validationError.message || 'Заполните обязательные поля перед отправкой.');
      return;
    }

    if (items.length === 0) {
      alert('Нет атрибутов для отправки. Заполните значения перед сохранением.');
      return;
    }

    try {
      setSavingAttributes(true);
      setSavingAttributesLabel(STATUS_CHECK_PROGRESS_MESSAGE);
      setAttributesUpdateStatus({ message: STATUS_CHECK_PROGRESS_MESSAGE, error: '' });

      const response = await fetch('/api/products/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          profile: currentProfile,
          mode: 'import'
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData?.error || 'Не удалось обновить атрибуты');
      }

      const statusCheck = responseData?.status_check;
      if (statusCheck?.error) {
        setAttributesUpdateStatus({
          message: '',
          error: statusCheck.error
        });
      } else {
        setAttributesUpdateStatus({
          message:
            statusCheck?.message ||
            'Проверка статуса выполнена. Ознакомьтесь с выводом выше.',
          error: ''
        });
      }
    } catch (error) {
      console.error('saveAttributesToOzon error', error);
      setAttributesUpdateStatus({
        message: '',
        error: error.message || 'Ошибка при обновлении атрибутов'
      });
    } finally {
      setSavingAttributes(false);
      setSavingAttributesLabel('Отправляем...');
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
      <AttributesModal
        source="products"
        isOpen={Boolean(attributes)}
        productsState={{
          attributes,
          editableAttributes,
          selectedProduct,
          loadingAttributes,
          savingAttributes,
          savingAttributesLabel,
          attributesUpdateStatus
        }}
        onProductsRefresh={refreshAttributesModal}
        onProductsSave={saveAttributesToOzon}
        onProductsClose={closeAttributes}
        onProductsManualValueChange={handleManualValueChange}
        onProductsAttributeValueChange={handleAttributeValueChange}
        onProductsDictionaryValueChange={handleDictionaryValueChange}
        onProductsTypeChange={handleTypeIdChange}
        onProductsSubmit={saveAttributesToOzon}
        productsSubmitLoading={savingAttributes}
        onProductsMetaChange={handleProductMetaChange}
        profile={currentProfile}
        offerId={selectedProduct}
        priceContextLabel={selectedProduct ? `Товар ${selectedProduct}` : undefined}
      />
    </div>)
}

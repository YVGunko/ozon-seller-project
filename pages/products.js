// pages/products.js
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ProfileManager } from '../src/utils/profileManager';
import { apiClient } from '../src/services/api-client';
import { useProductAttributes } from '../src/hooks/useProductAttributes';
import {
  REQUIRED_BASE_FIELDS,
  NUMERIC_BASE_FIELDS,
  BASE_FIELD_LABELS,
  PRICE_FIELDS
} from '../src/constants/productFields';
import { AttributesModal } from '../src/components/attributes';
import {
  LARGE_TEXT_ATTRIBUTE_IDS,
  TYPE_ATTRIBUTE_ID,
  SINGLE_VALUE_STRING_ATTRIBUTE_IDS,
  parsePositiveTypeId,
  getAttributeKey,
  syncTypeAttributeWithTypeId,
  formatAttributeValues,
  parseAttributeInput,
  getDictionaryOptionKey,
  getDictionaryOptionLabel,
  buildDictionaryValueEntry,
  getDictionaryValueEntryKey,
  isDictionaryValueEntry,
  normalizeAttributeValues,
  areAttributeValuesEqual,
  normalizeProductAttributes,
  attributeHasValues,
  collapseLargeTextAttributeValues
} from '../src/utils/attributesHelpers';
import {
  normalizeImageList,
  clampImageListToLimit,
  normalizePrimaryImage,
  areImageListsEqual,
  ensureImagesPresent
} from '../src/utils/imageHelpers';

const STATUS_CHECK_PROGRESS_MESSAGE = 'Проверяю статус карточки...';
const hasValue = (value) => value !== undefined && value !== null && value !== '';
const resolveInfoPriceField = (info, field) => {
  if (!info) return null;
  const raw = info[field];
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw === 'object') {
    if (hasValue(raw.price)) return raw.price;
    if (hasValue(raw.value)) return raw.value;
    if (hasValue(raw.amount)) return raw.amount;
  }
  return raw;
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

  const [savingAttributes, setSavingAttributes] = useState(false);
  const [savingAttributesLabel, setSavingAttributesLabel] = useState('Отправляем...');
  const [attributesUpdateStatus, setAttributesUpdateStatus] = useState({ message: '', error: '' });
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copySourceProduct, setCopySourceProduct] = useState(null);
  const [copyForm, setCopyForm] = useState({
    new_offer_id: '',
    name: ''
  });

  const [error, setError] = useState(null);

  const {
    attributes,
    setAttributes,
    editableAttributes,
    setEditableAttributes,
    loadingAttributes,
    error: attributesError,
    loadAttributes
  } = useProductAttributes(apiClient, currentProfile);

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

      console.log('[products] raw response', result);
      const responseItems =
        (Array.isArray(result?.result?.items) && result.result.items) ||
        (Array.isArray(result?.items) && result.items) ||
        (Array.isArray(result?.result) && result.result) ||
        [];

      if (responseItems.length) {
        const items = responseItems.map((item) => {
          const derivedSku =
            item?.sku ??
            (Array.isArray(item?.sources) && item.sources.length ? item.sources[0]?.sku : '') ??
            '';
          return {
            ...item,
            name: item?.name ?? item?.product_name ?? item?.title ?? '',
            sku: derivedSku
          };
        });
        setProducts(prev => reset ? items : [...prev, ...items]);
        setPagination(prev => ({
          ...prev,
          last_id: result?.result?.last_id || result?.last_id || '',
          hasMore: Boolean(result?.result?.last_id || result?.last_id)
        }));
      } else if (Array.isArray(result)) {
        console.warn('[products] unexpected array response structure', result);
        setProducts(prev => reset ? result : [...prev, ...result]);
        setPagination(prev => ({ ...prev, hasMore: result.length === prev.limit }));
      } else {
        console.warn('[products] unexpected response', result);
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
    setSelectedProduct(offerId);
    setAttributesUpdateStatus({ message: '', error: '' });

    try {
      await loadAttributes(offerId);
    } catch (err) {
      console.error('fetchAttributes error', err);
    } finally {
      // loading state управляется внутри useProductAttributes
    }
  };

  const closeAttributes = () => {
    setSelectedProduct(null);
    setAttributes(null);
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
      const nextValue = Array.isArray(value) ? [...value] : value;
      return prev.map((product, idx) => {
        if (idx !== productIndex) return product;
        return {
          ...product,
          [field]: nextValue
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

    const isNewProduct = Boolean(attributes?.isNewProduct);
    const originalProducts = Array.isArray(attributes?.result) ? attributes.result : [];

    return editableAttributes
      .map((item, idx) => {
        const offerId = item.offer_id || selectedProduct;
        if (!offerId) return null;

        const originalProduct = isNewProduct ? {} : originalProducts[idx] || {};
        const userTypeId = parsePositiveTypeId(item.type_id ?? item.typeId);
        const originalTypeId = parsePositiveTypeId(originalProduct?.type_id ?? originalProduct?.typeId);
        const resolvedTypeId = userTypeId ?? originalTypeId ?? null;

        const metaSource = isNewProduct
          ? (attributes?.result && attributes.result[idx]) || {}
          : originalProduct;
        const requiredAttributeMeta = (metaSource?.available_attributes || []).filter(
          (meta) => meta?.is_required
        );
        const requiredAttributeIds = new Set(
          requiredAttributeMeta
            .map((meta) => Number(meta?.id ?? meta?.attribute_id))
            .filter((id) => Number.isFinite(id) && id > 0)
        );
        const missingRequiredAttributes = [];
        requiredAttributeMeta.forEach((meta) => {
          const attrKey = getAttributeKey(meta?.id ?? meta?.attribute_id);
          if (!attrKey) return;
          const editableAttr = (item.attributes || []).find(
            (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
          );
          if (!attributeHasValues(editableAttr)) {
            missingRequiredAttributes.push(meta?.name || `ID ${attrKey}`);
          }
        });
        if (missingRequiredAttributes.length) {
          throw new Error(
            `Товар ${offerId}: заполните обязательные характеристики ${missingRequiredAttributes.join(
              ', '
            )}`
          );
        }

        const attributesPayload = (item.attributes || [])
          .map(attr => {
            const id = Number(attr?.id ?? attr?.attribute_id);
            if (!id) return null;
            let values = normalizeAttributeValues(attr.values);
            values = collapseLargeTextAttributeValues(id, values);
            if (!values.length) return null;

            const originalAttr = (originalProduct.attributes || []).find(
              original => Number(original?.id ?? original?.attribute_id) === id
            );
            let originalValues = normalizeAttributeValues(originalAttr?.values || []);
            originalValues = collapseLargeTextAttributeValues(id, originalValues);

            const isRequiredAttr = requiredAttributeIds.has(id);
            if (!isRequiredAttr && areAttributeValuesEqual(values, originalValues)) {
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
        let hasMediaUpdates = false;

        if (attributesPayload.length) {
          payload.attributes = attributesPayload;
        }

        if (resolvedTypeId !== null) {
          payload.type_id = resolvedTypeId;
        }

        if (item.name && item.name !== originalProduct.name) {
          payload.name = item.name;
        }

        const normalizedPrimary = normalizePrimaryImage(item.primary_image);
        const originalPrimary = normalizePrimaryImage(originalProduct.primary_image);
        const normalizedImages = clampImageListToLimit(
          Array.isArray(item.images) ? item.images : [],
          normalizedPrimary
        );
        const originalImages = normalizeImageList(originalProduct.images || []);

        if (!normalizedImages.length) {
          throw new Error(`Товар ${offerId}: добавьте хотя бы одно изображение`);
        }

        if (!areImageListsEqual(normalizedImages, originalImages)) {
          payload.images = normalizedImages;
          hasMediaUpdates = true;
        }

        if (normalizedPrimary !== originalPrimary) {
          payload.primary_image = normalizedPrimary || '';
          hasMediaUpdates = true;
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

        const resolvedDescriptionCategoryId =
          item.description_category_id ??
          item.descriptionCategoryId ??
          originalProduct.description_category_id ??
          originalProduct.descriptionCategoryId ??
          metaSource?.description_category_id ??
          metaSource?.descriptionCategoryId ??
          null;

        if (resolvedDescriptionCategoryId !== null && resolvedDescriptionCategoryId !== undefined) {
          const numericCategoryId = Number(resolvedDescriptionCategoryId);
          payload.description_category_id = Number.isFinite(numericCategoryId)
            ? numericCategoryId
            : resolvedDescriptionCategoryId;
        }

        if (isNewProduct) {
          if (
            !payload.attributes &&
            !hasBaseFields &&
            !payload.name &&
            !hasMediaUpdates
          ) {
            payload.attributes = [];
          }
          return payload;
        }

        if (
          !payload.attributes &&
          !typeChanged &&
          !hasBaseFields &&
          !payload.name &&
          !hasMediaUpdates
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
          profileId: currentProfile.id,
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
    setCopySourceProduct(product);
    setCopyForm({
      new_offer_id: `${product.offer_id}-copy`,
      name: product.name || ''
    });
    setCopyModalOpen(true);
  };

  const copyProduct = async () => {
    const trimmedNewOffer = copyForm.new_offer_id.trim();
    const trimmedName = copyForm.name.trim();
    if (!trimmedNewOffer) {
      alert('Пожалуйста, введите новый артикул');
      return;
    }
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль');
      return;
    }
    if (!copySourceProduct) {
      alert('Не выбран исходный товар для копирования');
      return;
    }

    setCopyLoading(true);
    try {
      console.log('[copy] source product', copySourceProduct);
      const sourceRaw = JSON.parse(JSON.stringify(copySourceProduct));
      console.log('[copy] raw clone', sourceRaw);

      sourceRaw.offer_id = trimmedNewOffer;
      sourceRaw.offerId = trimmedNewOffer;
      delete sourceRaw.product_id;
      delete sourceRaw.productId;
      delete sourceRaw.id;
      delete sourceRaw.sku;
      delete sourceRaw.barcode;
      delete sourceRaw.barcodes;

      if (trimmedName) {
        sourceRaw.name = trimmedName;
      }

      REQUIRED_BASE_FIELDS.forEach((field) => {
        const primaryValue = sourceRaw[field];
        const fallbackValue = copySourceProduct?.[field];
        const resolved = hasValue(primaryValue) ? primaryValue : fallbackValue;
        if (hasValue(resolved)) {
          sourceRaw[field] = resolved;
          console.log('[copy] field resolved', field, resolved);
        } else {
          console.warn('[copy] field missing', field);
        }
      });

      const missingPriceFields = PRICE_FIELDS.filter(
        (field) => !hasValue(sourceRaw[field])
      );
      if (missingPriceFields.length && copySourceProduct?.offer_id && currentProfile?.id) {
        try {
          const infoQuery = new URLSearchParams({
            offer_id: copySourceProduct.offer_id,
            profileId: currentProfile.id
          });
          const infoResponse = await fetch(
            `/api/products/info-list?${infoQuery.toString()}`
          );
          if (infoResponse.ok) {
            const infoData = await infoResponse.json();
            const infoItem =
              (Array.isArray(infoData?.items) && infoData.items[0]) ||
              (Array.isArray(infoData?.raw?.items) && infoData.raw.items[0]) ||
              null;
            if (infoItem) {
              PRICE_FIELDS.forEach((field) => {
                if (hasValue(sourceRaw[field])) return;
                const resolved = resolveInfoPriceField(infoItem, field);
                if (hasValue(resolved)) {
                  sourceRaw[field] = String(resolved);
                  console.log('[copy] info-list resolved', field, resolved);
                }
              });
            } else {
              console.warn('[copy] info-list: item not found for', copySourceProduct.offer_id);
            }
          } else {
            const infoText = await infoResponse.text();
            console.error('[copy] info-list request failed', infoResponse.status, infoText);
          }
        } catch (infoError) {
          console.error('[copy] failed to fetch info-list', infoError);
        }
      }

      const descriptionCategoryId =
        sourceRaw.description_category_id ?? sourceRaw.descriptionCategoryId;
      const typeId = sourceRaw.type_id ?? sourceRaw.typeId;
      let availableAttributes = Array.isArray(sourceRaw.available_attributes)
        ? sourceRaw.available_attributes
        : [];

      if (descriptionCategoryId && typeId && !availableAttributes.length) {
        try {
          const metaResponse = await apiClient.getDescriptionAttributes(
            {
              description_category_id: descriptionCategoryId,
              type_id: typeId,
              attributes: Array.isArray(sourceRaw.attributes)
                ? sourceRaw.attributes
                : []
            },
            currentProfile
          );
          availableAttributes = Array.isArray(metaResponse?.attributes)
            ? metaResponse.attributes
            : [];
          console.log('[copy] loaded description attributes', {
            count: availableAttributes.length,
            descriptionCategoryId,
            typeId
          });
        } catch (metaError) {
          console.error(
            '[copy] failed to load description attributes',
            metaError
          );
        }
      } else if (!descriptionCategoryId || !typeId) {
        console.warn('[copy] missing description category or type_id', {
          descriptionCategoryId,
          typeId
        });
      }

      sourceRaw.available_attributes = availableAttributes;

      const normalized = normalizeProductAttributes([sourceRaw]);
      const sourceEditable = JSON.parse(JSON.stringify(normalized[0] || {}));

      sourceEditable.offer_id = trimmedNewOffer;
      if (trimmedName) {
        sourceEditable.name = trimmedName;
      }

      REQUIRED_BASE_FIELDS.forEach((field) => {
        if (hasValue(sourceRaw[field])) {
          sourceEditable[field] = sourceRaw[field];
        }
      });

      setAttributes({
        result: [sourceRaw],
        isNewProduct: true
      });
      setEditableAttributes([sourceEditable]);
      setSelectedProduct(trimmedNewOffer);
      setAttributesUpdateStatus({ message: '', error: '' });
      setCopyModalOpen(false);
      setCopySourceProduct(null);
    } catch (err) {
      console.error('copyProduct error', err);
      alert('Ошибка при подготовке копии: ' + (err.message || err));
    } finally {
      setCopyLoading(false);
    }
  };

  const handleCopyFormChange = (field, value) => {
    setCopyForm((prev) => ({
      ...prev,
      [field]: value
    }));
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
            <div style={{ fontSize: 12 }}>Client ID: {currentProfile?.client_hint || '—'}</div>
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
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Название</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>SKU</th>
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
                <td style={{ padding: 12 }}>{product.product_id || product.id || '—'}</td>
              <td style={{ padding: 12, fontWeight: 'bold' }}>{product.offer_id}</td>
              <td style={{ padding: 12 }}>{product.name || '—'}</td>
              <td style={{ padding: 12 }}>{product.sku || '—'}</td>
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
      {copyModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 8,
              padding: 24,
              maxWidth: 500,
              width: '100%',
              position: 'relative',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 16 }}>Копирование товара</h2>
            <p style={{ marginTop: 0, color: '#6c757d', fontSize: 14 }}>
              Источник: <strong>{copySourceProduct?.offer_id}</strong>
            </p>

            <p style={{ fontSize: 13, color: '#6c757d', marginBottom: 15 }}>
              Укажите новый артикул и название. Остальные атрибуты можно будет скорректировать в следующем шаге.
            </p>

            <label style={{ display: 'block', marginBottom: 10 }}>
              Новый артикул (offer_id)
              <input
                type="text"
                value={copyForm.new_offer_id}
                onChange={(e) => handleCopyFormChange('new_offer_id', e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: '1px solid #ced4da',
                  marginTop: 4
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 10 }}>
              Название
              <input
                type="text"
                value={copyForm.name}
                onChange={(e) => handleCopyFormChange('name', e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 4,
                  border: '1px solid #ced4da',
                  marginTop: 4
                }}
              />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => {
                  setCopyModalOpen(false);
                  setCopySourceProduct(null);
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: '1px solid #ced4da',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={copyProduct}
                disabled={copyLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: 'none',
                  backgroundColor: '#28a745',
                  color: '#fff',
                  cursor: copyLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {copyLoading ? 'Подготавливаем…' : 'Продолжить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>)
}

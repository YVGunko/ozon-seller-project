// pages/products.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiClient } from '../src/services/api-client';
import { useProductAttributes } from '../src/hooks/useProductAttributes';
import { useCurrentContext } from '../src/hooks/useCurrentContext';
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
  const { profile: currentProfile } = useCurrentContext();
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
  const [copyLoading, setCopyLoading] = useState(false);

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
  const [ratingMap, setRatingMap] = useState(new Map());
  const ratingMapRef = useRef(new Map());
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState('');
  const [ratingModal, setRatingModal] = useState(null);
  const [ratingSortOrder, setRatingSortOrder] = useState('desc');
  const startNewProduct = useCallback(() => {
    if (!currentProfile) {
      alert('Сначала выберите профиль на главной странице');
      return;
    }
    const offerId = `new-${Date.now()}`;
    router.push(`/products/${offerId}/attributes?mode=new`);
  }, [router, currentProfile]);

  // currentProfile теперь приходит из useCurrentContext

  // fetchProducts function
  const loadRatingsForSkus = useCallback(
    async (skus = []) => {
      if (!currentProfile) return;
      const uniqueSkus = Array.from(new Set(skus.filter(Boolean)));
      const toFetch = uniqueSkus.filter((sku) => !ratingMapRef.current.has(sku));
      if (!toFetch.length) return;
    setRatingLoading(true);
      try {
        let map = new Map(ratingMapRef.current);
        const chunkSize = 50;
        for (let i = 0; i < toFetch.length; i += chunkSize) {
          const chunk = toFetch.slice(i, i + chunkSize);
          const response = await fetch('/api/products/rating-by-sku', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus: chunk, profileId: currentProfile.id })
          });
          const data = await response.json();
          if (response.ok && Array.isArray(data?.products)) {
            data.products.forEach((entry) => {
              map.set(String(entry.sku), entry);
            });
          } else {
            console.warn('Failed to fetch rating chunk', data);
          }
        }
        ratingMapRef.current = map;
        setRatingMap(map);
        setRatingError('');
      } catch (error) {
        console.error('Failed to load product ratings', error);
        setRatingError('Не удалось загрузить рейтинги');
      } finally {
        setRatingLoading(false);
      }
    },
    [currentProfile]
  );

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
        setProducts((prev) => (reset ? items : [...prev, ...items]));
        loadRatingsForSkus(items.map((entry) => entry.sku));
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

        // Массив images является обязательным — всегда передаём его в payload,
        // даже если ссылки не менялись.
        payload.images = normalizedImages;
        hasMediaUpdates = true;

        // Всегда явно передаём primary_image, даже если он не менялся.
        // Если пользователь не задал primary_image, используем первое изображение из списка.
        const effectivePrimary =
          normalizedPrimary || (normalizedImages.length ? normalizedImages[0] : '');
        if (effectivePrimary) {
          payload.primary_image = effectivePrimary;
          // Если primary совпадает с оригинальным и images не менялись,
          // это не считается обновлением медиа — флаг не трогаем.
          if (effectivePrimary !== originalPrimary) {
            hasMediaUpdates = true;
          }
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

  const handleCopyClick = async (product) => {
    if (!currentProfile) {
      alert('Сначала выберите профиль на главной странице');
      return;
    }
    if (!product?.offer_id) {
      alert('Не найден offer_id исходного товара');
      return;
    }

    const newOfferId = `${product.offer_id}-copy`;
    const trimmedNewOffer = newOfferId.trim();
    const trimmedName = (product.name || '').trim();

    setCopyLoading(true);
    try {
      const sourceRaw = JSON.parse(JSON.stringify(product));

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
        const fallbackValue = product?.[field];
        const resolved = hasValue(primaryValue) ? primaryValue : fallbackValue;
        if (hasValue(resolved)) {
          sourceRaw[field] = resolved;
        }
      });

      const missingPriceFields = PRICE_FIELDS.filter(
        (field) => !hasValue(sourceRaw[field])
      );
      if (missingPriceFields.length && product?.offer_id && currentProfile?.id) {
        try {
          const infoQuery = new URLSearchParams({
            offer_id: product.offer_id,
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
                }
              });
            }
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
        } catch (metaError) {
          console.error(
            '[copy] failed to load description attributes',
            metaError
          );
        }
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

      if (typeof window !== 'undefined') {
        const payload = {
          offer_id: trimmedNewOffer,
          source_offer_id: product.offer_id,
          attributes: {
            result: [sourceRaw],
            isNewProduct: true
          },
          editable: sourceEditable
        };
        window.localStorage.setItem('attributesCopyDraft', JSON.stringify(payload));
      }

      router.push(
        `/products/${encodeURIComponent(
          trimmedNewOffer
        )}/attributes?mode=new&source=${encodeURIComponent(product.offer_id)}`
      );
    } catch (err) {
      console.error('copyProduct error', err);
      alert('Ошибка при подготовке копии: ' + (err.message || err));
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

  const sortedProducts = useMemo(() => {
    const array = [...filteredProducts];
    const getRatingValue = (product) => {
      const sku = product?.sku;
      if (!sku) return -1;
      const entry = ratingMap.get(String(sku));
      if (!entry) return -1;
      return Number.isFinite(entry.rating) ? entry.rating : -1;
    };
    array.sort((a, b) => {
      const ra = getRatingValue(a);
      const rb = getRatingValue(b);
      if (ra === rb) return 0;
      return ratingSortOrder === 'asc' ? ra - rb : rb - ra;
    });
    return array;
  }, [filteredProducts, ratingMap, ratingSortOrder]);

  const toggleRatingSort = () => {
    setRatingSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
  };

  return (
    <div className="oz-page">
      {/* Заголовок страницы */}
      <div className="oz-page-header">
        <div className="oz-breadcrumb">
          <Link href="/" className="oz-breadcrumb-link">
            Главная
          </Link>
          <span className="oz-breadcrumb-separator"> / </span>
          <span className="oz-breadcrumb-link">Товары</span>
        </div>

        <div className="oz-page-title-block">
          <h1 className="oz-page-title">Управление товарами OZON</h1>
          <p className="oz-page-subtitle">
            Просмотр, редактирование, копирование и анализ контент‑рейтинга
          </p>
        </div>
      </div>

      <div className="oz-main">
        {/* Карточка профиля и создания товара */}
        <div className="oz-card oz-card-meta">
          <div className="oz-card-body">
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                flexWrap: 'wrap'
              }}
            >
              <div>
                {currentProfile ? (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 16,
                      alignItems: 'baseline',
                      fontSize: 13
                    }}
                  >
                    <div>
                      <span
                        className="oz-meta-label"
                        style={{ marginRight: 4 }}
                      >
                        Активный профиль:
                      </span>
                      <span className="oz-meta-value">{currentProfile.name}</span>
                    </div>
                    <div>
                      <span
                        className="oz-meta-label"
                        style={{ marginRight: 4 }}
                      >
                        Client ID:
                      </span>
                      <span className="oz-meta-code">
                        {currentProfile?.client_hint || '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="oz-alert oz-alert-error">
                    Профиль не выбран — вернитесь на главную и выберите профиль.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Карточка с фильтрами и таблицей */}
        <div className="oz-card">
          <div className="oz-card-header">
            <h2 className="oz-card-title">Список товаров</h2>
            <span className="oz-card-subtitle">
              Фильтруйте по артикулу и открывайте карточку для редактирования
            </span>
          </div>

          <div className="oz-card-body">
            {/* Фильтры */}
            <div className="oz-card-filters">
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  alignItems: 'flex-end'
                }}
              >
                <div className="oz-form-group" style={{ flex: '1 1 260px' }}>
                  <label className="oz-label">Артикул (offer_id)</label>
                  <input
                    type="text"
                    className="oz-input"
                    value={filters.offer_id}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, offer_id: e.target.value }))
                    }
                    placeholder="Введите артикул"
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center'
                  }}
                >
                  <button
                    type="button"
                    className="oz-btn oz-btn-primary"
                    onClick={applyFilters}
                  >
                    Применить
                  </button>
                  <button
                    type="button"
                    className="oz-btn oz-btn-secondary"
                    onClick={resetFilters}
                  >
                    Сбросить
                  </button>
                  <div
                    style={{
                      width: 1,
                      alignSelf: 'stretch',
                      backgroundColor: '#e5e7eb',
                      margin: '0 4px'
                    }}
                  />
                  <button
                    type="button"
                    onClick={startNewProduct}
                    className="oz-btn oz-btn-success"
                  >
                    Новый товар
                  </button>
                </div>
              </div>
            </div>

            {/* Ошибка загрузки */}
            {error && (
              <div className="oz-alert oz-alert-error">Ошибка: {error}</div>
            )}

            {/* Сводка по количеству */}
            <div style={{ marginBottom: 8, fontSize: 13, color: '#6b7280' }}>
              Показано: {filteredProducts.length} товаров
              {products.length !== filteredProducts.length &&
                ` (отфильтровано из ${products.length})`}
            </div>

            {/* Таблица товаров */}
            <div className="oz-table-wrapper">
              <table className="oz-table">
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Product ID</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Артикул</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Название</th>
              <th style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>SKU</th>
              <th style={{ padding: 12, textAlign: 'center', borderBottom: '1px solid #dee2e6' }}>
                <button
                  type="button"
                  onClick={toggleRatingSort}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontWeight: 'bold'
                  }}
                >
                  Контент-рейтинг
                  <span>{ratingSortOrder === 'asc' ? '▲' : '▼'}</span>
                  {ratingLoading && <span style={{ fontSize: 12 }}>⌛</span>}
                </button>
                {ratingError && (
                  <div style={{ fontSize: 11, color: '#b91c1c' }}>{ratingError}</div>
                )}
              </th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((product) => (
              <tr key={product.product_id || product.offer_id}>
                <td className="oz-cell-mono">
                  {product.product_id || product.id || '—'}
                </td>
                <td className="oz-cell-mono" style={{ fontWeight: 600 }}>
                  {product.offer_id}
                </td>
                <td>{product.name || '—'}</td>
                <td className="oz-cell-mono">{product.sku || '—'}</td>
                <td style={{ textAlign: 'center', fontSize: 14 }}>
                  {(() => {
                    const sku = product.sku;
                    const entry = sku ? ratingMap.get(String(sku)) : null;
                    const showLoading = ratingLoading && !entry;
                    if (entry) {
                      return (
                        <button
                          type="button"
                          onClick={() => setRatingModal({ sku, ...entry })}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0d6efd',
                            cursor: 'pointer',

                            padding: 12
                          }}
                        >
                          {entry.rating !== undefined ? Number(entry.rating).toFixed(1) : '—'}
                        </button>
                      );
                    }
                    return showLoading ? '…' : '—';
                  })()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
                    <Link href={`/products/${product.offer_id}/attributes`} legacyBehavior>
                      <a
                        className="oz-btn oz-btn-primary"
                        style={{ padding: '6px 12px', fontSize: 12 }}
                      >
                        Атрибуты
                      </a>
                    </Link>
                    <button
                      onClick={() => handleCopyClick(product)}
                      disabled={copyLoading}
                      className="oz-btn oz-btn-secondary"
                      style={{ padding: '6px 12px', fontSize: 12 }}
                    >
                      {copyLoading ? 'Копируем…' : 'Копировать'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredProducts.length === 0 && !loading && (
          <div className="oz-empty" style={{ textAlign: 'center', padding: 24 }}>
            Товары не найдены
          </div>
        )}
            </div>

            {/* Пагинация */}
            {pagination.hasMore && (
              <div className="oz-pagination">
                <button
                  type="button"
                  onClick={() => fetchProducts(false)}
                  disabled={loading}
                  className={`oz-btn oz-btn-primary ${loading ? 'oz-btn-disabled' : ''}`}
                >
                  {loading ? 'Загрузка…' : 'Загрузить ещё'}
                </button>
              </div>
            )}

            {!pagination.hasMore && products.length > 0 && (
              <div className="oz-empty">Все товары загружены</div>
            )}
          </div>
        </div>

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
      {ratingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100
          }}
          onClick={() => setRatingModal(null)}
        >
          <div
            style={{
              width: 'min(640px, 90vw)',
              maxHeight: '80vh',
              overflowY: 'auto',
              backgroundColor: '#fff',
              padding: 20,
              borderRadius: 10
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ marginBottom: 12, fontWeight: 'bold' }}>
              Контент-рейтинг SKU {ratingModal.sku}: {ratingModal.rating ?? '—'}
            </div>
            {Array.isArray(ratingModal.groups) && ratingModal.groups.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 'bold' }}>Группы</div>
                {ratingModal.groups.map((group) => (
                  <div key={group.key || group.name} style={{ marginTop: 6 }}>
                    <div>
                      {group.name}: рейтинг {Number(group.rating ?? 0).toFixed(1)}, вес{' '}
                      {group.weight ?? 0}%
                    </div>
                    {group.improve_at_least && (
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        Заполните {group.improve_at_least} атрибутов:
                        {Array.isArray(group.improve_attributes)
                          ? group.improve_attributes.map((attr) => ` ${attr.name}`)
                          : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(ratingModal.conditions) && ratingModal.conditions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 'bold' }}>Условия</div>
                {ratingModal.conditions.map((condition) => (
                  <div
                    key={condition.key}
                    style={{
                      marginTop: 6,
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: condition.fulfilled ? '#ecfdf5' : '#fef3c7'
                    }}
                  >
                    <div>{condition.description}</div>
                    <div style={{ fontSize: 12, color: '#6c757d' }}>
                      {condition.fulfilled ? 'Выполнено' : 'Не выполнено'} — {condition.cost} баллов
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setRatingModal(null)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                cursor: 'pointer'
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

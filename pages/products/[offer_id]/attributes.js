import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  REQUIRED_BASE_FIELDS,
  BASE_FIELD_LABELS,
  NUMERIC_BASE_FIELDS
} from '../../../src/constants/productFields';
import { ProfileManager } from '../../../src/utils/profileManager';
import { useProductAttributes } from '../../../src/hooks/useProductAttributes';
import { apiClient } from '../../../src/services/api-client';
import {
  attributeHasValues,
  buildDictionaryValueEntry,
  formatAttributeValues,
  getAttributeKey,
  getDictionaryOptionKey,
  getDictionaryOptionLabel,
  getDictionaryValueEntryKey,
  isDictionaryValueEntry,
  parseAttributeInput,
  syncTypeAttributeWithTypeId,
  TYPE_ATTRIBUTE_ID,
  LARGE_TEXT_ATTRIBUTE_IDS,
  parsePositiveTypeId,
  normalizeAttributeValues,
  collapseLargeTextAttributeValues,
  areAttributeValuesEqual
} from '../../../src/utils/attributesHelpers';
import {
  normalizeImageList,
  clampImageListToLimit,
  normalizePrimaryImage,
  areImageListsEqual
} from '../../../src/utils/imageHelpers';
import { PriceInfoPanel, ImagesManager } from '../../../src/components/attributes';

const PRIMARY_PRODUCT_INDEX = 0;
const STATUS_CHECK_PROGRESS_MESSAGE = 'Проверяю статус карточки...';
const hasValue = (value) => value !== undefined && value !== null && value !== '';

const SectionHeader = ({ title }) => (
  <h2 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h2>
);

const parseLinksFromTextarea = (value = '') =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export default function ProductAttributesPage() {
  const router = useRouter();
  const { offer_id } = router.query;
  const [currentProfile, setCurrentProfile] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [priceInfo, setPriceInfo] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [savingAttributes, setSavingAttributes] = useState(false);
  const [savingLabel, setSavingLabel] = useState('Отправляем...');
  const [attributesUpdateStatus, setAttributesUpdateStatus] = useState({ message: '', error: '' });
  const containerRef = useRef(null);

  const {
    attributes,
    setAttributes,
    editableAttributes,
    setEditableAttributes,
    loadingAttributes,
    error: attributesError,
    loadAttributes
  } = useProductAttributes(apiClient, currentProfile);

  useEffect(() => {
    setCurrentProfile(ProfileManager.getCurrentProfile());
  }, []);

  useEffect(() => {
    if (offer_id && currentProfile) {
      loadAttributes(offer_id);
    }
  }, [offer_id, currentProfile, loadAttributes]);

  useEffect(() => {
    if (!offer_id || !currentProfile) {
      setPriceInfo(null);
      setPriceError('');
      setPriceLoading(false);
      return;
    }

    let cancelled = false;

    const fetchPriceInfo = async () => {
      setPriceLoading(true);
      setPriceError('');
      try {
        const query = new URLSearchParams({
          offer_id,
          profileId: currentProfile.id
        });
        const response = await fetch(`/api/products/info-list?${query.toString()}`);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Не удалось получить цены');
        }
        const data = await response.json();
        if (cancelled) return;
        const item =
          (Array.isArray(data?.items) && data.items[0]) ||
          (Array.isArray(data?.raw?.items) && data.raw.items[0]) ||
          null;
        setPriceInfo(item);
      } catch (error) {
        if (!cancelled) {
          setPriceInfo(null);
          setPriceError(error.message || 'Не удалось получить цены');
        }
      } finally {
        if (!cancelled) {
          setPriceLoading(false);
        }
      }
    };

    fetchPriceInfo();

    return () => {
      cancelled = true;
    };
  }, [offer_id, currentProfile]);

  useEffect(() => {
    return () => {
      setAttributes(null);
      setEditableAttributes(null);
    };
  }, [setAttributes, setEditableAttributes]);

  const editableProduct = editableAttributes?.[0] || null;
  const selectedOfferId = editableProduct?.offer_id || (typeof offer_id === 'string' ? offer_id : '');

  const productInfo = useMemo(() => {
    if (!attributes) return null;
    if (Array.isArray(attributes?.result) && attributes.result.length) {
      return attributes.result[0];
    }
    return null;
  }, [attributes]);

  const availableAttributesMeta = useMemo(() => {
    return Array.isArray(productInfo?.available_attributes)
      ? productInfo.available_attributes
      : [];
  }, [productInfo]);

  const attributeMetaMap = useMemo(() => {
    const map = new Map();
    availableAttributesMeta.forEach((meta) => {
      const key = getAttributeKey(meta?.id ?? meta?.attribute_id);
      if (key) {
        map.set(key, meta);
      }
    });
    return map;
  }, [availableAttributesMeta]);

  const attributeList = useMemo(() => {
    if (!editableProduct) return [];
    const source = Array.isArray(editableProduct.attributes)
      ? editableProduct.attributes
      : [];
    return source
      .map((attr, index) => ({
        ...attr,
        __order: index,
        __attrKey: getAttributeKey(attr?.id ?? attr?.attribute_id)
      }))
      .filter((attr) => attr.__attrKey)
      .sort((a, b) => {
        const metaA = attributeMetaMap.get(a.__attrKey);
        const metaB = attributeMetaMap.get(b.__attrKey);
        const reqA = metaA?.is_required ? 1 : 0;
        const reqB = metaB?.is_required ? 1 : 0;
        if (reqA !== reqB) {
          return reqA ? -1 : 1;
        }
        return attributeComparator(a, b);
      });
  }, [editableProduct, attributeMetaMap]);

  const attributeGroups = useMemo(() => {
    const map = new Map();
    attributeList.forEach((attr) => {
      const meta = attributeMetaMap.get(attr.__attrKey);
      const groupName =
        meta?.group_name ||
        meta?.attribute_group_name ||
        attr?.attribute_group_name ||
        'Прочее';
      if (!map.has(groupName)) {
        map.set(groupName, {
          key: groupName,
          label: groupName,
          attributes: [],
          hasRequired: false
        });
      }
      const group = map.get(groupName);
      group.attributes.push({ attr, meta });
      if (meta?.is_required) {
        group.hasRequired = true;
      }
    });
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      if (a.hasRequired !== b.hasRequired) {
        return a.hasRequired ? -1 : 1;
      }
      return a.label.localeCompare(b.label, 'ru');
    });
    return groups;
  }, [attributeList, attributeMetaMap]);

  const requiredAttributeCount = useMemo(() => {
    return availableAttributesMeta.filter((meta) => meta?.is_required).length;
  }, [availableAttributesMeta]);

  const missingRequiredCount = useMemo(() => {
    return attributeList.filter((attr) => {
      const meta = attributeMetaMap.get(attr.__attrKey);
      return meta?.is_required && !attributeHasValues(attr);
    }).length;
  }, [attributeList, attributeMetaMap]);

  const typeAttributeFromList = attributeList.find(
    (attr) => attr.__attrKey === TYPE_ATTRIBUTE_ID
  );
  const fallbackTypeValue = typeAttributeFromList
    ? formatAttributeValues(typeAttributeFromList.values || [])
    : '';
  const typeInputRaw =
    editableProduct?.type_id ?? productInfo?.type_id ?? fallbackTypeValue ?? '';
  const typeInputValue =
    typeInputRaw === undefined || typeInputRaw === null ? '' : String(typeInputRaw);
  const typeMeta = attributeMetaMap.get(TYPE_ATTRIBUTE_ID);

  const sectionRefs = {
    base: useRef(null),
    media: useRef(null),
    groups: useRef(new Map())
  };

  const scrollToRef = (target) => {
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) {
      setMediaFiles((prev) => [...prev, ...files]);
    }
  };

  const handleProductMetaChange = useCallback(
    (productIndex, field, value) => {
      setEditableAttributes((prev) => {
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
    },
    [setEditableAttributes]
  );

  useEffect(() => {
    if (!priceInfo || !editableProduct) return;
    REQUIRED_BASE_FIELDS.forEach((field) => {
      const currentValue = editableProduct[field];
      const incoming = priceInfo[field];
      if (!hasValue(currentValue) && hasValue(incoming)) {
        handleProductMetaChange(PRIMARY_PRODUCT_INDEX, field, String(incoming));
      }
    });
  }, [priceInfo, editableProduct, handleProductMetaChange]);

  const handleAttributeValueChange = useCallback(
    (productIndex, attributeId, rawValue) => {
      setEditableAttributes((prev) => {
        if (!prev) return prev;
        return prev.map((product, idx) => {
          if (idx !== productIndex) return product;
          const values = parseAttributeInput(rawValue, attributeId);
          const attributes = Array.isArray(product.attributes)
            ? product.attributes.map((attr) => ({ ...attr }))
            : [];
          const attrKey = getAttributeKey(attributeId);
          if (!attrKey) return product;
          const attrIndex = attributes.findIndex(
            (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
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
    },
    [setEditableAttributes]
  );

  const handleManualValueChange = useCallback(
    (productIndex, attributeId, rawValue) => {
      setEditableAttributes((prev) => {
        if (!prev) return prev;
        const manualValues = parseAttributeInput(rawValue, attributeId);
        return prev.map((product, idx) => {
          if (idx !== productIndex) return product;
          const attrKey = getAttributeKey(attributeId);
          if (!attrKey) return product;
          const attributes = Array.isArray(product.attributes)
            ? product.attributes.map((attr) => ({ ...attr }))
            : [];
          const attrIndex = attributes.findIndex(
            (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
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
    },
    [setEditableAttributes]
  );

  const handleDictionaryValueChange = useCallback(
    (productIndex, attributeId, selectedKeys, optionsMap) => {
      setEditableAttributes((prev) => {
        if (!prev) return prev;
        const normalizedKeys = Array.isArray(selectedKeys)
          ? Array.from(new Set(selectedKeys.filter(Boolean)))
          : [];
        return prev.map((product, idx) => {
          if (idx !== productIndex) return product;
          const attrKey = getAttributeKey(attributeId);
          if (!attrKey) return product;
          const attributes = Array.isArray(product.attributes)
            ? product.attributes.map((attr) => ({ ...attr }))
            : [];
          const attrIndex = attributes.findIndex(
            (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
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
          const manualValues = existingValues.filter((value) => !isDictionaryValueEntry(value));
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
    },
    [setEditableAttributes]
  );

  const handleTypeIdChange = useCallback(
    (productIndex, rawValue) => {
      setEditableAttributes((prev) => {
        if (!prev) return prev;
        return prev.map((product, idx) => {
          if (idx !== productIndex) return product;
          const nextProduct = { ...product };
          const normalized =
            typeof rawValue === 'string' ? rawValue.trim() : rawValue ?? '';
          nextProduct.type_id = normalized;
          nextProduct.attributes = syncTypeAttributeWithTypeId(
            nextProduct.attributes,
            normalized,
            { force: true }
          );
          return nextProduct;
        });
      });
    },
    [setEditableAttributes]
  );

  const handlePaste = (event) => {
    const text = event.clipboardData.getData('text/plain');
    if (!text || !editableProduct) return;
    const links = parseLinksFromTextarea(text);
    if (!links.length) return;
    const existing = Array.isArray(editableProduct.images) ? editableProduct.images : [];
    const merged = Array.from(new Set([...existing, ...links]));
    handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'images', merged);
  };

  const baseValues = editableProduct || {};
  const primaryImage = editableProduct?.primary_image || '';
  const currentImages = Array.isArray(editableProduct?.images)
    ? editableProduct.images
    : [];

  const sanitizeItemsForUpdate = useCallback(() => {
    if (!editableAttributes || editableAttributes.length === 0) return [];

    const isNewProduct = Boolean(attributes?.isNewProduct);
    const originalProducts = Array.isArray(attributes?.result) ? attributes.result : [];

    return editableAttributes
      .map((item, idx) => {
        const offerId = item.offer_id || selectedOfferId;
        if (!offerId) return null;

        const originalProduct = isNewProduct ? {} : originalProducts[idx] || {};
        const metaSource = isNewProduct
          ? (attributes?.result && attributes.result[idx]) || {}
          : originalProduct;

        const userTypeId = parsePositiveTypeId(item.type_id ?? item.typeId);
        const originalTypeId = parsePositiveTypeId(originalProduct?.type_id ?? originalProduct?.typeId);
        const resolvedTypeId = userTypeId ?? originalTypeId ?? null;

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
            `Товар ${offerId}: заполните обязательные характеристики ${missingRequiredAttributes.join(', ')}`
          );
        }

        const attributesPayload = (item.attributes || [])
          .map((attr) => {
            const id = Number(attr?.id ?? attr?.attribute_id);
            if (!id) return null;
            let values = normalizeAttributeValues(attr.values);
            values = collapseLargeTextAttributeValues(id, values);
            if (!values.length) return null;

            const originalAttr = (originalProduct.attributes || []).find(
              (original) => Number(original?.id ?? original?.attribute_id) === id
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
          throw new Error(`Товар ${offerId}: заполните поля ${readable.join(', ')}`);
        }

        const hasBaseFields = Object.keys(baseFieldUpdates).length > 0;
        if (hasBaseFields) {
          Object.assign(payload, baseFieldUpdates);
        }

        const descriptionCategoryId =
          item.description_category_id ??
          item.descriptionCategoryId ??
          originalProduct.description_category_id ??
          originalProduct.descriptionCategoryId ??
          metaSource?.description_category_id ??
          metaSource?.descriptionCategoryId ??
          null;

        if (descriptionCategoryId !== null && descriptionCategoryId !== undefined) {
          const numericCategoryId = Number(descriptionCategoryId);
          payload.description_category_id = Number.isFinite(numericCategoryId)
            ? numericCategoryId
            : descriptionCategoryId;
        }

        const typeChanged = userTypeId !== null && userTypeId !== originalTypeId;

        if (isNewProduct) {
          if (!payload.attributes && !hasBaseFields && !payload.name && !hasMediaUpdates) {
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
  }, [editableAttributes, attributes, selectedOfferId]);

  const handleSaveAttributes = useCallback(async () => {
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль на главной странице');
      return;
    }
    if (!selectedOfferId) {
      alert('Не удалось определить товар для сохранения');
      return;
    }

    let items;
    try {
      items = sanitizeItemsForUpdate();
    } catch (validationError) {
      alert(validationError.message || 'Заполните обязательные поля перед отправкой.');
      return;
    }

    if (!items.length) {
      alert('Нет изменений для отправки. Обновите значения и повторите.');
      return;
    }

    try {
      setSavingAttributes(true);
      setSavingLabel(STATUS_CHECK_PROGRESS_MESSAGE);
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

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось обновить атрибуты');
      }

      const statusCheck = data?.status_check;
      if (statusCheck?.error) {
        setAttributesUpdateStatus({ message: '', error: statusCheck.error });
      } else {
        setAttributesUpdateStatus({
          message:
            statusCheck?.message ||
            'Проверка статуса выполнена. Ознакомьтесь с выводом выше.',
          error: ''
        });
      }
    } catch (error) {
      console.error('handleSaveAttributes error', error);
      setAttributesUpdateStatus({
        message: '',
        error: error.message || 'Ошибка при обновлении атрибутов'
      });
    } finally {
      setSavingAttributes(false);
      setSavingLabel('Отправляем...');
    }
  }, [currentProfile, selectedOfferId, sanitizeItemsForUpdate]);

  const handleRefreshClick = useCallback(() => {
    if (!selectedOfferId) {
      alert('Не удалось определить товар для обновления');
      return;
    }
    setAttributesUpdateStatus({ message: '', error: '' });
    loadAttributes(selectedOfferId);
  }, [selectedOfferId, loadAttributes]);

  const isSaveDisabled = savingAttributes || !editableProduct || loadingAttributes;

  const renderGroupButton = (label, onClick, disabled) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...navButtonStyle,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
      disabled={disabled}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex' }}>
      <aside
        style={{
          width: 260,
          borderRight: '1px solid #e2e8f0',
          padding: 20,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto'
        }}
      >
        <h3 style={{ marginTop: 0 }}>Навигация</h3>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {renderGroupButton(
            'Обязательные параметры',
            () => scrollToRef(sectionRefs.base.current),
            !editableProduct
          )}
          {renderGroupButton('Фото', () => scrollToRef(sectionRefs.media.current), !editableProduct)}
          {attributeGroups.map((group) => (
            <button
              type="button"
              key={group.key}
              onClick={() => scrollToRef(sectionRefs.groups.current.get(group.key))}
              style={{
                ...navButtonStyle,
                opacity: group.attributes.length ? 1 : 0.5,
                cursor: group.attributes.length ? 'pointer' : 'not-allowed'
              }}
              disabled={!group.attributes.length}
            >
              {group.label}
            </button>
          ))}
        </nav>
      </aside>
      <main ref={containerRef} style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ marginBottom: 12 }}>
          <Link href="/products" legacyBehavior>
            <a style={{ color: '#0d6efd', textDecoration: 'none' }}>← Вернуться к списку товаров</a>
          </Link>
        </div>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Атрибуты {offer_id}</h1>
            {productInfo?.id && (
              <div style={{ color: '#475569', fontSize: 13 }}>Product ID: {productInfo.id}</div>
            )}
            {productInfo?.sku && (
              <div style={{ color: '#475569', fontSize: 13 }}>SKU: {productInfo.sku}</div>
            )}
            {attributesError && <div style={{ color: '#dc2626' }}>{attributesError}</div>}
            {!currentProfile && (
              <div style={{ color: '#b91c1c', fontSize: 13 }}>
                Выберите профиль на главной странице, чтобы загрузить атрибуты.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={handleRefreshClick}
              style={{
                ...primaryButtonStyle,
                backgroundColor: loadingAttributes ? '#6c757d' : primaryButtonStyle.backgroundColor,
                cursor: loadingAttributes ? 'not-allowed' : 'pointer',
                opacity: !selectedOfferId ? 0.6 : 1
              }}
              disabled={!selectedOfferId || loadingAttributes}
            >
              {loadingAttributes ? 'Загрузка...' : 'Обновить'}
            </button>
            <button
              type="button"
              onClick={handleSaveAttributes}
              style={{
                ...secondaryButtonStyle,
                backgroundColor: isSaveDisabled ? '#cbd5f5' : '#22c55e',
                color: isSaveDisabled ? '#475569' : '#fff',
                cursor: isSaveDisabled ? 'not-allowed' : 'pointer'
              }}
              disabled={isSaveDisabled}
            >
              {savingAttributes ? savingLabel : 'Сохранить изменения'}
            </button>
          </div>
        </header>
        <PriceInfoPanel
          priceInfo={priceInfo}
          priceLoading={priceLoading}
          priceError={priceError}
          contextLabel={selectedOfferId ? `Товар ${selectedOfferId}` : 'Цены товара'}
        />
        {attributesUpdateStatus.message && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 6,
              backgroundColor: '#ecfccb',
              color: '#14532d',
              border: '1px solid #bbf7d0'
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
              backgroundColor: '#fee2e2',
              color: '#b91c1c',
              border: '1px solid #fecaca'
            }}
          >
            {attributesUpdateStatus.error}
          </div>
        )}
        {loadingAttributes && (
          <div style={{ marginBottom: 16, color: '#2563eb', fontSize: 13 }}>
            Загружаем атрибуты из OZON…
          </div>
        )}
        {!loadingAttributes && !editableProduct && (
          <div style={{ marginBottom: 24, color: '#475569' }}>
            Данные товара ещё не загружены. Проверьте профиль или повторите попытку позже.
          </div>
        )}
        <section ref={sectionRefs.base} style={sectionStyle}>
          <SectionHeader title="Обязательные параметры" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16
            }}
          >
            {REQUIRED_BASE_FIELDS.map((field) => (
              <div key={field}>
                <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 4 }}>
                  {BASE_FIELD_LABELS[field] || field}
                </label>
                <input
                  type="text"
                  value={baseValues[field] || ''}
                  onChange={(event) =>
                    handleProductMetaChange(PRIMARY_PRODUCT_INDEX, field, event.target.value)
                  }
                  style={inputStyle}
                  placeholder="Введите значение"
                  disabled={!editableProduct}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#475569', marginBottom: 4 }}>
              Type ID (ID {TYPE_ATTRIBUTE_ID})
            </label>
            <input
              type="text"
              value={typeInputValue}
              onChange={(event) => handleTypeIdChange(PRIMARY_PRODUCT_INDEX, event.target.value)}
              style={inputStyle}
              placeholder="Введите type_id"
              disabled={!editableProduct}
            />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {typeMeta?.description || 'Type ID определяет категорию и набор характеристик товара.'}
              {productInfo?.type_id && String(productInfo.type_id) !== typeInputValue && (
                <div style={{ marginTop: 4 }}>Текущее значение в OZON: {productInfo.type_id}</div>
              )}
            </div>
          </div>
          {requiredAttributeCount > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: missingRequiredCount > 0 ? '#fef3c7' : '#ecfccb',
                border: '1px solid #fde68a',
                color: '#78350f',
                fontSize: 13
              }}
            >
              Обязательных характеристик: {requiredAttributeCount}. Не заполнено: {missingRequiredCount}.
            </div>
          )}
        </section>
        <section
          ref={sectionRefs.media}
          style={{ ...sectionStyle, border: '1px dashed #cbd5f5' }}
          onDrop={handleDrop}
          onDragOver={(event) => event.preventDefault()}
          onPaste={handlePaste}
        >
          <SectionHeader title="Фото и медиа" />
          <p style={{ color: '#475569', fontSize: 13 }}>
            Используйте ссылки или загрузите файл — мы автоматически добавим его в OZON. Для удобства
            работы в странице добавлен тот же менеджер изображений, что и в модалке.
          </p>
          <ImagesManager
            title="Изображения товара"
            images={currentImages}
            primaryImage={primaryImage}
            onImagesChange={(next) => handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'images', next)}
            onPrimaryChange={(value) => handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'primary_image', value)}
            disabled={!editableProduct || savingAttributes || loadingAttributes}
          />
          {mediaFiles.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
              Файлов в буфере: {mediaFiles.length}. Их ссылки появятся после загрузки через менеджер.
            </div>
          )}
        </section>
        {attributeGroups.length === 0 && editableProduct && (
          <section style={sectionStyle}>
            <SectionHeader title="Характеристики" />
            <div style={{ color: '#475569' }}>
              Не удалось определить группы характеристик для этого товара.
            </div>
          </section>
        )}
        {attributeGroups.map((group) => (
          <section
            key={group.key}
            ref={(el) => {
              if (!sectionRefs.groups.current) {
                sectionRefs.groups.current = new Map();
              }
              if (el) {
                sectionRefs.groups.current.set(group.key, el);
              } else {
                sectionRefs.groups.current.delete(group.key);
              }
            }}
            style={sectionStyle}
          >
            <SectionHeader title={group.label} />
            {!group.attributes.length && (
              <div style={{ color: '#475569' }}>Пока нет характеристик в этой группе.</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {group.attributes.map(({ attr, meta }, index) => {
                const attrKey = attr.__attrKey || getAttributeKey(attr?.id ?? attr?.attribute_id);
                if (!attrKey) return null;
                let dictionaryOptions = Array.isArray(meta?.dictionary_values)
                  ? meta.dictionary_values.filter((option) => getDictionaryOptionKey(option))
                  : [];
                const dictionaryOptionMap = new Map();
                dictionaryOptions.forEach((option) => {
                  const key = getDictionaryOptionKey(option);
                  if (key && !dictionaryOptionMap.has(key)) {
                    dictionaryOptionMap.set(key, option);
                  }
                });
                const dictionaryEntries = (attr.values || []).filter(isDictionaryValueEntry);
                const manualEntries = (attr.values || []).filter((value) => !isDictionaryValueEntry(value));
                dictionaryEntries.forEach((entry) => {
                  const key =
                    getDictionaryValueEntryKey(entry, dictionaryOptionMap) ||
                    getAttributeKey(entry?.dictionary_value_id ?? entry?.value_id ?? entry?.id);
                  if (key && !dictionaryOptionMap.has(key)) {
                    const syntheticOption = {
                      dictionary_value_id:
                        entry?.dictionary_value_id ?? entry?.value_id ?? entry?.id,
                      value: getDictionaryOptionLabel({
                        value: entry?.value ?? entry?.text ?? entry?.value_text,
                        dictionary_value_id:
                          entry?.dictionary_value_id ?? entry?.value_id ?? entry?.id
                      })
                    };
                    dictionaryOptionMap.set(key, syntheticOption);
                    dictionaryOptions = [...dictionaryOptions, syntheticOption];
                  }
                });
                const selectedDictionaryKeys = dictionaryEntries
                  .map((entry) => getDictionaryValueEntryKey(entry, dictionaryOptionMap))
                  .filter(Boolean);
                const dictionarySelectValue = meta?.is_collection
                  ? selectedDictionaryKeys
                  : selectedDictionaryKeys[0] ?? '';
                const manualValueString = formatAttributeValues(manualEntries);
                const fallbackValueString = formatAttributeValues(attr.values || []);
                const hasDictionaryOptions = dictionaryOptions.length > 0;
                const textareaValue = hasDictionaryOptions ? manualValueString : fallbackValueString;
                const isLargeField =
                  LARGE_TEXT_ATTRIBUTE_IDS.has(attrKey) ||
                  ['text', 'html', 'richtext'].includes((meta?.type || '').toLowerCase());
                const isRequired = Boolean(meta?.is_required);
                const hasValue = attributeHasValues(attr);
                const rows = isLargeField ? 6 : 3;
                const textareaProps = hasDictionaryOptions
                  ? {
                      value: manualValueString,
                      onChange: (event) =>
                        handleManualValueChange(PRIMARY_PRODUCT_INDEX, attrKey, event.target.value)
                    }
                  : {
                      value: textareaValue,
                      onChange: (event) =>
                        handleAttributeValueChange(PRIMARY_PRODUCT_INDEX, attrKey, event.target.value)
                    };

                return (
                  <div
                    key={`${attrKey}-${index}`}
                    style={{
                      border: `1px solid ${isRequired && !hasValue ? '#f8b4b4' : '#e2e8f0'}`,
                      borderRadius: 8,
                      padding: 16,
                      backgroundColor: isRequired && !hasValue ? '#fff7ed' : '#fff'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 8
                      }}
                    >
                      <div style={{ fontWeight: 600, color: isRequired && !hasValue ? '#b45309' : '#0f172a' }}>
                        {meta?.name || attr.name || `ID ${attrKey}`}
                        {isRequired && <span style={{ marginLeft: 8, color: '#dc2626' }}>*</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>ID: {attrKey}</div>
                    </div>
                    {isRequired && !hasValue && (
                      <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>
                        Заполните значение перед отправкой в OZON
                      </div>
                    )}
                    {hasDictionaryOptions && (
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                          Значения из справочника
                        </label>
                        <select
                          multiple={!!meta?.is_collection}
                          value={dictionarySelectValue}
                          onChange={(event) => {
                            if (meta?.is_collection) {
                              const values = Array.from(event.target.selectedOptions).map((option) => option.value);
                              handleDictionaryValueChange(
                                PRIMARY_PRODUCT_INDEX,
                                attrKey,
                                values,
                                dictionaryOptionMap
                              );
                            } else {
                              handleDictionaryValueChange(
                                PRIMARY_PRODUCT_INDEX,
                                attrKey,
                                event.target.value ? [event.target.value] : [],
                                dictionaryOptionMap
                              );
                            }
                          }}
                          style={{
                            width: '100%',
                            borderRadius: 6,
                            border: '1px solid #cbd5f5',
                            padding: 8,
                            minHeight: meta?.is_collection ? 120 : 40
                          }}
                          disabled={!editableProduct}
                        >
                          {!meta?.is_collection && <option value="">— Не выбрано —</option>}
                          {dictionaryOptions.map((option) => {
                            const key = getDictionaryOptionKey(option);
                            if (!key) return null;
                            return (
                              <option key={key} value={key}>
                                {getDictionaryOptionLabel(option)}
                              </option>
                            );
                          })}
                        </select>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                          {meta?.is_collection
                            ? 'Для множественного выбора удерживайте Ctrl/Cmd.'
                            : 'Выберите значение или оставьте пустым, чтобы очистить'}
                        </div>
                      </div>
                    )}
                    <textarea
                      rows={rows}
                      style={{
                        width: '100%',
                        padding: 10,
                        borderRadius: 8,
                        border: '1px solid #cbd5f5',
                        resize: 'vertical',
                        minHeight: isLargeField ? 140 : 90,
                        fontSize: 13
                      }}
                      placeholder="Введите значения"
                      disabled={!editableProduct}
                      {...textareaProps}
                    />
                    <div
                      style={{
                        fontSize: 12,
                        color: '#94a3b8',
                        marginTop: 6,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12
                      }}
                    >
                      {meta?.type && <span>Тип: {meta.type}</span>}
                      <span>
                        Макс. значений:{' '}
                        {meta?.max_value_count && meta.max_value_count > 0
                          ? meta.max_value_count
                          : '∞'}
                      </span>
                      <span>{meta?.dictionary_id ? 'Использует справочник' : 'Ввод вручную'}</span>
                      {meta?.is_collection && <span>Допускает несколько значений</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

const navButtonStyle = {
  border: '1px solid #cbd5f5',
  padding: '8px 10px',
  backgroundColor: '#fff',
  color: '#0f172a',
  borderRadius: 6,
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 13
};

const sectionStyle = {
  backgroundColor: '#fff',
  padding: 20,
  borderRadius: 12,
  marginBottom: 24,
  boxShadow: '0 1px 2px rgba(15,23,42,0.1)'
};

const primaryButtonStyle = {
  padding: '8px 14px',
  backgroundColor: '#0d6efd',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer'
};

const secondaryButtonStyle = {
  padding: '8px 14px',
  backgroundColor: '#e2e8f0',
  color: '#475569',
  border: 'none',
  borderRadius: 6,
  cursor: 'not-allowed'
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #cbd5f5',
  borderRadius: 6,
  fontSize: 14
};

const getOrderValue = (attr, fallback = 0) => {
  const raw =
    attr?.order ??
    attr?.position ??
    attr?.sort_index ??
    attr?.sortIndex ??
    attr?.__order ??
    attr?.__index;
  if (raw === undefined || raw === null) {
    return fallback;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const attributeComparator = (a = {}, b = {}) => {
  const orderA = getOrderValue(a, 0);
  const orderB = getOrderValue(b, 0);
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  const idA = Number(a?.id ?? a?.attribute_id ?? a?.attributeId);
  const idB = Number(b?.id ?? b?.attribute_id ?? b?.attributeId);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idA - idB;
  }
  const nameA = String(a?.name || '');
  const nameB = String(b?.name || '');
  if (nameA && nameB) {
    const compare = nameA.localeCompare(nameB, 'ru');
    if (compare !== 0) {
      return compare;
    }
  }
  return 0;
};

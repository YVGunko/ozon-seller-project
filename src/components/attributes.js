import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TYPE_ATTRIBUTE_ID,
  LARGE_TEXT_ATTRIBUTE_IDS,
  attributeHasValues,
  formatAttributeValues,
  getDictionaryOptionKey,
  getDictionaryOptionLabel,
  getDictionaryValueEntryKey,
  isDictionaryValueEntry,
  getAttributeKey
} from '../utils/attributesHelpers';
import {
  PRICE_FIELDS,
  DIMENSION_FIELDS,
  REQUIRED_BASE_FIELDS,
  BASE_FIELD_LABELS
} from '../constants/productFields';
import {
  MAX_IMAGE_COUNT,
  normalizeImageList
} from '../utils/imageHelpers';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 20
};

const hasValue = (value) => value !== undefined && value !== null && value !== '';
const isValidImageUrl = (value) => {
  if (!value) return false;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  return /^https?:\/\//i.test(trimmed);
};

export const PriceInfoPanel = ({ priceInfo, priceLoading, priceError, contextLabel }) => {
  if (!priceLoading && !priceInfo && !priceError) {
    return null;
  }

  const resolveValue = (value) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') {
      return value.price ?? value.value ?? '';
    }
    return value;
  };

  const fields = [
    { label: 'Валюта', value: priceInfo?.currency_code },
    { label: 'Цена', value: resolveValue(priceInfo?.price) },
    { label: 'Старая цена', value: resolveValue(priceInfo?.old_price) },
    { label: 'Мин. цена', value: resolveValue(priceInfo?.min_price) }
  ];

  return (
    <div
      style={{
        marginBottom: 16,
        padding: '12px 16px',
        border: '1px solid #d1e7dd',
        borderRadius: 8,
        backgroundColor: '#f0fdf4'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
        {contextLabel || 'Цены товара'}
      </div>
      {priceLoading ? (
        <div style={{ color: '#0d6efd', fontSize: 13 }}>Загрузка цен...</div>
      ) : priceError ? (
        <div style={{ color: '#dc3545', fontSize: 13 }}>{priceError}</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 8,
            fontSize: 13
          }}
        >
          {fields.map((field) => (
            <div key={field.label}>
              <div style={{ color: '#6c757d' }}>{field.label}</div>
              <div style={{ fontWeight: 'bold' }}>
                {field.value ? String(field.value) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MAX_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export const ImagesManager = ({
  title = 'Изображения',
  images = [],
  primaryImage = '',
  onImagesChange = () => {},
  onPrimaryChange = () => {},
  disabled = false
}) => {
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const normalizedImages = useMemo(() => normalizeImageList(images), [images]);
  const normalizedPrimary = primaryImage ? String(primaryImage).trim() : '';
  const effectiveLimit = normalizedPrimary ? MAX_IMAGE_COUNT - 1 : MAX_IMAGE_COUNT;
  const limitReached = normalizedImages.length >= effectiveLimit;
  const limitExceeded = normalizedImages.length > effectiveLimit;

  useEffect(() => {
    setError('');
    setUploadError('');
  }, [normalizedImages.length, normalizedPrimary]);

  const handleAdd = () => {
    const trimmed = newUrl.trim();
    if (!trimmed) {
      setError('Введите ссылку на изображение');
      return;
    }
    if (!isValidImageUrl(trimmed)) {
      setError('Ссылка должна начинаться с http(s) и быть доступной');
      return;
    }
    if (normalizedImages.includes(trimmed)) {
      setError('Такое изображение уже добавлено');
      return;
    }
    if (limitReached) {
      setError(
        normalizedPrimary
          ? 'При заданном основном изображении можно добавить не более 29 ссылок'
          : 'Нельзя добавить больше 30 изображений'
      );
      return;
    }
    onImagesChange([...normalizedImages, trimmed]);
    setNewUrl('');
    setError('');
  };

  const handleRemove = (index) => {
    const next = normalizedImages.filter((_, idx) => idx !== index);
    onImagesChange(next);
    if (normalizedPrimary && normalizedPrimary === normalizedImages[index]) {
      onPrimaryChange('');
    }
  };

  const moveItem = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= normalizedImages.length) return;
    const next = [...normalizedImages];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onImagesChange(next);
  };

  const handleSetPrimary = (url) => {
    if (!url) return;
    onPrimaryChange(url);
  };

  const handlePrimaryInputChange = (value) => {
    onPrimaryChange(value.trim());
  };

  const handleUploadClick = () => {
    if (disabled || uploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (!file.type.startsWith('image/')) {
        setUploadError('Можно загружать только изображения (JPG/PNG).');
        return;
      }
      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        setUploadError('Файл слишком большой. Максимум 8 МБ.');
        return;
      }
      if (limitReached) {
        setUploadError('Сначала удалите лишние изображения перед загрузкой.');
        return;
      }
      setUploadError('');
      setUploading(true);
      const params = new URLSearchParams({
        filename: file.name,
        contentType: file.type || 'application/octet-stream'
      });
      const response = await fetch(`/api/uploads/blob?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось загрузить файл');
      }
      if (data?.url) {
        onImagesChange([...normalizedImages, data.url]);
        if (!normalizedPrimary) {
          onPrimaryChange(data.url);
        }
      }
    } catch (uploadErr) {
      console.error('Image upload error', uploadErr);
      setUploadError(uploadErr?.message || 'Не удалось загрузить изображение');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div
      style={{
        border: '1px solid #dfe3e8',
        borderRadius: 8,
        padding: 16,
        marginBottom: 20,
        backgroundColor: '#fff'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        <span style={{ fontSize: 12, color: '#6c757d' }}>
          {normalizedImages.length}
          {normalizedPrimary ? '/29' : '/30'}
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 13 }}>
          Главное изображение
        </label>
        <input
          type="text"
          value={normalizedPrimary}
          onChange={(e) => handlePrimaryInputChange(e.target.value)}
          placeholder="Вставьте ссылку или выберите из списка ниже"
          disabled={disabled}
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #ced4da'
          }}
        />
        <small style={{ color: '#6c757d', display: 'block', marginTop: 4 }}>
          Если поле пустое, первое изображение в списке станет главным на OZON.
        </small>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 13 }}>
          Добавить изображение
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            disabled={disabled}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid #ced4da'
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={disabled}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: 6,
              backgroundColor: '#0070f3',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Добавить
          </button>
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={disabled || uploading}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid #ced4da',
              backgroundColor: uploading ? '#f1f3f5' : '#fff',
              cursor: disabled || uploading ? 'not-allowed' : 'pointer'
            }}
          >
            {uploading ? 'Загрузка...' : 'Загрузить файл'}
          </button>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
        {error && (
          <div style={{ color: '#dc3545', fontSize: 12, marginTop: 6 }}>{error}</div>
        )}
        {uploadError && (
          <div style={{ color: '#dc3545', fontSize: 12, marginTop: 6 }}>{uploadError}</div>
        )}
      </div>

      {limitExceeded && (
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            backgroundColor: '#fff3cd',
            color: '#856404',
            fontSize: 13,
            marginBottom: 10
          }}
        >
          Для указанного количества изображений уменьшите список до {effectiveLimit}{' '}
          ссылок или очистите поле с главным изображением.
        </div>
      )}

      {normalizedImages.length === 0 ? (
        <div style={{ color: '#6c757d', fontSize: 13 }}>
          Изображения не добавлены. Вставьте публичную ссылку из Google Drive или другого
          хранилища и нажмите «Добавить».
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {normalizedImages.map((url, index) => (
            <div
              key={`${url}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: '1px solid #e9ecef',
                borderRadius: 8,
                padding: '8px 10px',
                backgroundColor: '#f8f9fa'
              }}
            >
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 6,
                  border: '1px solid #ced4da',
                  overflow: 'hidden',
                  backgroundColor: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img
                  src={url}
                  alt={`img-${index}`}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                    if (e.currentTarget.parentElement) {
                      e.currentTarget.parentElement.style.backgroundColor = '#f8d7da';
                    }
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    wordBreak: 'break-all',
                    color: '#212529'
                  }}
                >
                  {url}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => moveItem(index, -1)}
                    disabled={disabled || index === 0}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid #ced4da',
                      backgroundColor: index === 0 ? '#f1f3f5' : '#fff',
                      cursor: index === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    disabled={disabled || index === normalizedImages.length - 1}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      border: '1px solid #ced4da',
                      backgroundColor:
                        index === normalizedImages.length - 1 ? '#f1f3f5' : '#fff',
                      cursor:
                        index === normalizedImages.length - 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(url)}
                    disabled={disabled}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: '1px solid #ced4da',
                      backgroundColor:
                        normalizedPrimary === url ? '#28a745' : 'transparent',
                      color: normalizedPrimary === url ? '#fff' : '#212529',
                      cursor: 'pointer'
                    }}
                  >
                    {normalizedPrimary === url ? 'Главное' : 'Сделать главным'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    disabled={disabled}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: '1px solid #ced4da',
                      backgroundColor: '#fff',
                      color: '#dc3545',
                      cursor: 'pointer'
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const MetaFieldsSection = ({ values, onChange, baseValues }) => {
  if (!values || !onChange) {
    return null;
  }

  const fieldGroups = [
    { title: 'Цены', fields: PRICE_FIELDS },
    { title: 'Габариты и вес', fields: DIMENSION_FIELDS }
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: '10px 0' }}>Обязательные параметры для OZON</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {fieldGroups.map((group) => (
          <div key={group.title} style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{group.title}</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12
              }}
            >
              {group.fields.map((field) => (
                <div key={field}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                    {BASE_FIELD_LABELS[field] || field}
                  </label>
                  <input
                    type="text"
                    value={values[field] ?? ''}
                    onChange={(e) => onChange(field, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: 4,
                      border: '1px solid #ced4da'
                    }}
                    placeholder={baseValues && baseValues[field] ? `По умолчанию: ${baseValues[field]}` : ''}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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

const ImportAttributesContent = ({
  state,
  onClose,
  onSave,
  onValueChange,
  fieldMappings,
  pricePanelProps,
  onSubmit,
  submitDisabled,
  submitLoading,
  onMetaChange,
  baseValues,
  priceInfo
}) => {
  const rowNumber = (state?.rowIndex ?? 0) + 1;
  const attributes = useMemo(() => {
    return (state?.attributes || [])
      .map((attr, index) => ({ ...attr, __index: index }))
      .sort(attributeComparator);
  }, [state?.attributes]);
  const metaValues = state?.metaValues || {};
  const handleMetaChange = onMetaChange || (() => {});
  const combinedBaseValues = {
    ...(priceInfo || {}),
    ...(baseValues || {})
  };

  useEffect(() => {
    if (!priceInfo || !onMetaChange) return;
    REQUIRED_BASE_FIELDS.forEach((field) => {
      if (!hasValue(metaValues[field]) && hasValue(priceInfo[field])) {
        onMetaChange(field, String(priceInfo[field]));
      }
    });
  }, [priceInfo, metaValues, onMetaChange]);

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: 12,
        width: 'min(900px, 95vw)',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 12px 24px rgba(15, 23, 42, 0.25)'
      }}
    >
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e9ecef',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Атрибуты строки #{rowNumber}</h3>
          <div style={{ fontSize: 13, color: '#6c757d' }}>
            Значения будут отправлены в OZON при импорте товаров.
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            fontSize: '18px',
            cursor: 'pointer',
            color: '#6c757d'
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
        <PriceInfoPanel {...pricePanelProps} />
        <MetaFieldsSection
          values={metaValues}
          onChange={handleMetaChange}
          baseValues={combinedBaseValues}
        />
        <ImagesManager
          images={metaValues.images || []}
          primaryImage={metaValues.primary_image || ''}
          onImagesChange={(next) => handleMetaChange('images', next)}
          onPrimaryChange={(next) => handleMetaChange('primary_image', next)}
        />
        {attributes.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6c757d' }}>
            Атрибуты для выбранного образца отсутствуют
          </div>
        ) : (
          attributes.map((attr) => {
            const mappedField = attr.fieldKey ? fieldMappings?.[attr.fieldKey] : null;
            const isTypeAttribute = String(attr.id) === TYPE_ATTRIBUTE_ID;
            const typeDictionaryOptions = Array.isArray(attr.dictionaryValues)
              ? attr.dictionaryValues
              : [];
            const typeSelectValue = isTypeAttribute
              ? attr.selectedDictionaryId || attr.value || ''
              : '';
            return (
              <div
                key={attr.id}
                style={{
                  border: '1px solid #e9ecef',
                  borderRadius: 8,
                  padding: '12px 14px',
                  marginBottom: 12,
                  backgroundColor: mappedField ? '#f8fafc' : 'white'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>
                    {attr.name}
                    <span style={{ marginLeft: 8, color: '#6c757d', fontSize: 12 }}>
                      ID: {attr.id}
                    </span>
                    {attr.required && <span style={{ color: '#dc3545', marginLeft: 6 }}>*</span>}
                  </div>
                  {mappedField && (
                    <span style={{ fontSize: 12, color: '#0d6efd' }}>
                      Привязано к полю «{mappedField.name || attr.fieldKey}»
                    </span>
                  )}
                </div>
                {isTypeAttribute && typeDictionaryOptions.length > 0 ? (
                  <>
                    <select
                      value={typeSelectValue}
                      onChange={(e) =>
                        onValueChange?.(attr.id, e.target.value, {
                          selectedDictionaryId: e.target.value
                        })
                      }
                      style={{
                        width: '100%',
                        borderRadius: 6,
                        border: '1px solid #d0d5dd',
                        padding: 8,
                        fontSize: 13,
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="">Выберите тип товара</option>
                      {typeDictionaryOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: '#6c757d', marginTop: 6 }}>
                      Обязательный атрибут. Можно выбрать только одно значение.
                    </div>
                  </>
                ) : (
                  <>
                    <textarea
                      value={attr.value}
                      onChange={(e) => onValueChange?.(attr.id, e.target.value)}
                      rows={attr.fieldKey ? 3 : 4}
                      style={{
                        width: '100%',
                        borderRadius: 6,
                        border: '1px solid #d0d5dd',
                        padding: 8,
                        fontSize: 13,
                        resize: 'vertical',
                        backgroundColor: 'white',
                        minHeight: attr.fieldKey ? '64px' : '88px'
                      }}
                      placeholder="Введите значение атрибута..."
                    />
                    <div style={{ fontSize: 11, color: '#6c757d', marginTop: 6 }}>
                      {mappedField
                        ? 'Изменение обновит соответствующее поле в таблице.'
                        : 'Если оставить поле пустым, будет использовано значение из товара-образца.'}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid #e9ecef',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <button
          onClick={onSave}
          style={{
            padding: '10px 18px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Сохранить
        </button>
        <button
          onClick={onSubmit}
          disabled={submitDisabled}
          style={{
            padding: '10px 18px',
            backgroundColor: submitDisabled ? '#6c757d' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: submitDisabled ? 'not-allowed' : 'pointer',
            minWidth: 180,
            fontWeight: 'bold'
          }}
        >
          {submitLoading ? 'Отправляем...' : 'Отправить в OZON'}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '10px 18px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
};

const ProductsAttributesContent = ({
  attributes,
  editableAttributes,
  selectedProduct,
  loadingAttributes,
  savingAttributes,
  savingAttributesLabel,
  attributesUpdateStatus,
  onRefresh,
  onSave,
  onClose,
  onManualValueChange,
  onAttributeValueChange,
  onDictionaryValueChange,
  onTypeIdChange,
  onSubmit,
  submitDisabled,
  submitLoading,
  pricePanelProps,
  onMetaChange,
  priceInfo
}) => {
  const handleMetaChange = onMetaChange || (() => {});

  useEffect(() => {
    if (!priceInfo || !onMetaChange || !Array.isArray(editableAttributes)) return;
    REQUIRED_BASE_FIELDS.forEach((field) => {
      if (!hasValue(priceInfo[field])) return;
      editableAttributes.forEach((product, idx) => {
        if (!hasValue(product?.[field])) {
          onMetaChange(idx, field, String(priceInfo[field]));
        }
      });
    });
  }, [priceInfo, editableAttributes, onMetaChange]);
  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: 30,
        borderRadius: 8,
        maxWidth: 1400,
        maxHeight: '90vh',
        overflow: 'auto',
        width: '90vw',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.35)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20
        }}
      >
        <h2 style={{ margin: 0 }}>Атрибуты товара: {selectedProduct}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onRefresh}
            disabled={loadingAttributes}
            style={{
              padding: '8px 16px',
              backgroundColor: loadingAttributes ? '#6c757d' : '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loadingAttributes ? 'not-allowed' : 'pointer'
            }}
          >
            {loadingAttributes ? 'Обновляем...' : 'Обновить'}
          </button>
          <button
            onClick={onSubmit || onSave}
            disabled={
              submitDisabled ??
              (savingAttributes ||
                !editableAttributes ||
                !editableAttributes.length)
            }
            style={{
              padding: '8px 16px',
              backgroundColor:
                (submitDisabled ??
                  (savingAttributes ||
                    !editableAttributes ||
                    !editableAttributes.length))
                  ? '#6c757d'
                  : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor:
                (submitDisabled ??
                  (savingAttributes ||
                    !editableAttributes ||
                    !editableAttributes.length))
                  ? 'not-allowed'
                  : 'pointer'
            }}
          >
            {submitLoading || savingAttributes
              ? savingAttributesLabel
              : 'Отправить в OZON'}
          </button>
          <button
            onClick={onClose}
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

      <PriceInfoPanel {...pricePanelProps} />

      {attributesUpdateStatus?.message && (
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

      {attributesUpdateStatus?.error && (
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

      {attributes?.error ? (
        <div style={{ color: '#dc3545', padding: 20, textAlign: 'center' }}>
          Ошибка: {attributes.error}
        </div>
      ) : attributes?.result && attributes.result.length > 0 ? (
        <div>
          {attributes.result.map((productInfo, idx) => {
            const editableProduct = editableAttributes?.[idx] || productInfo;
            const availableAttributesMeta = Array.isArray(productInfo.available_attributes)
              ? productInfo.available_attributes
              : [];
            const attributeMetaMap = new Map(
              availableAttributesMeta
                .map((meta) => [getAttributeKey(meta?.id ?? meta?.attribute_id), meta])
                .filter(([key]) => !!key)
            );
            const attributeList = (editableProduct?.attributes || [])
              .map((attr, index) => ({
                ...attr,
                __order: index,
                __attrKey: getAttributeKey(attr?.id ?? attr?.attribute_id)
              }))
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
            const requiredAttributeCount = availableAttributesMeta.filter(
              (meta) => meta?.is_required
            ).length;
            const missingRequiredCount = attributeList.filter((attr) => {
              const attrKey = attr.__attrKey || getAttributeKey(attr?.id ?? attr?.attribute_id);
              if (!attrKey) return false;
              const meta = attributeMetaMap.get(attrKey);
              return meta?.is_required && !attributeHasValues(attr);
            }).length;
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
              typeInputRaw === undefined || typeInputRaw === null ? '' : String(typeInputRaw);

            return (
              <div key={idx} style={{ marginBottom: 20 }}>
                <div
                  style={{
                    marginBottom: 12,
                    padding: 15,
                    backgroundColor: '#f8f9fa',
                    borderRadius: 4
                  }}
                >
                  <h3>Основная информация</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <strong>ID:</strong> {productInfo.id}
                    </div>
                    <div>
                      <strong>Артикул:</strong> {productInfo.offer_id}
                    </div>
                    <div>
                      <strong>SKU:</strong> {productInfo.sku}
                    </div>
                    <div style={{ gridColumn: '1 / span 2' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Название товара</div>
                      <input
                        type="text"
                        value={editableProduct?.name ?? productInfo.name ?? ''}
                        onChange={(e) => onMetaChange?.(idx, 'name', e.target.value)}
                        placeholder="Введите название"
                        style={{
                          width: '100%',
                          padding: 8,
                          border: '1px solid #ced4da',
                          borderRadius: 4
                        }}
                      />
                    </div>
                    {productInfo.barcode && (
                      <div>
                        <strong>Штрихкод:</strong> {productInfo.barcode}
                      </div>
                    )}
                    {productInfo.weight && (
                      <div>
                        <strong>Вес:</strong> {productInfo.weight} {productInfo.weight_unit}
                      </div>
                    )}
                    {productInfo.description_category_id && (
                      <div>
                        <strong>Description category:</strong> {productInfo.description_category_id}
                      </div>
                    )}
                    <div style={{ gridColumn: '1 / span 2' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                        Тип (type_id / ID {TYPE_ATTRIBUTE_ID})
                      </div>
                      <input
                        type="text"
                        value={typeInputValue}
                        onChange={(e) => onTypeIdChange?.(idx, e.target.value)}
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

                <MetaFieldsSection
                  values={editableProduct}
                  onChange={(field, value) => handleMetaChange(idx, field, value)}
                  baseValues={{ ...(priceInfo || {}), ...productInfo }}
                />
                <ImagesManager
                  title="Изображения товара"
                  images={editableProduct?.images ?? productInfo.images ?? []}
                  primaryImage={
                    editableProduct?.primary_image ?? productInfo.primary_image ?? ''
                  }
                  onImagesChange={(next) =>
                    onMetaChange?.(idx, 'images', Array.isArray(next) ? next : [])
                  }
                  onPrimaryChange={(value) => onMetaChange?.(idx, 'primary_image', value)}
                  disabled={savingAttributes}
                />

                {requiredAttributeCount > 0 && (
                  <div
                    style={{
                      margin: '12px 0',
                      padding: '8px 12px',
                      borderRadius: 6,
                      backgroundColor: '#eef2ff',
                      color: '#312e81',
                      border: '1px solid #c7d2fe',
                      fontSize: 13
                    }}
                  >
                    Обязательные характеристики отмечены{' '}
                    <strong style={{ color: '#d97706' }}>*</strong>.
                    {missingRequiredCount > 0 && (
                      <span style={{ marginLeft: 6, color: '#b91c1c' }}>
                        Не заполнено: {missingRequiredCount}
                      </span>
                    )}
                  </div>
                )}

                {attributeList.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h3>Характеристики ({attributeList.length})</h3>
                    {!productInfo.available_attributes?.length && (
                      <div
                        style={{
                          padding: '8px 12px',
                          marginBottom: 10,
                          borderRadius: 6,
                          backgroundColor: '#fff3cd',
                          color: '#856404',
                          border: '1px solid #ffeeba',
                          fontSize: 13
                        }}
                      >
                        Для данной категории не удалось получить справочник характеристик. Ниже
                        показаны характеристики из товара.
                      </div>
                    )}
                    <div
                      style={{
                        maxHeight: '55vh',
                        overflow: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        paddingRight: 4
                      }}
                    >
                      {attributeList.map((attr, aIdx) => {
                        const attrKey = attr.__attrKey || getAttributeKey(attr?.id ?? attr?.attribute_id);
                        if (!attrKey) return null;

                        const meta = attributeMetaMap.get(attrKey);
                        const metaType = (meta?.type || '').toLowerCase();
                        const isTypeAttribute = attrKey === TYPE_ATTRIBUTE_ID;
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
                        const hasDictionaryOptions = dictionaryOptions.length > 0 && !isTypeAttribute;
                        const manualEntries = (attr.values || []).filter(
                          (value) => !isDictionaryValueEntry(value)
                        );
                        const dictionaryEntries = (attr.values || []).filter(isDictionaryValueEntry);
                        const manualValueString = formatAttributeValues(manualEntries);
                        const selectedDictionaryKeys = dictionaryEntries
                          .map((entry) =>
                            getDictionaryValueEntryKey(entry, dictionaryOptionMap)
                          )
                          .filter(Boolean);
                        dictionaryEntries.forEach((entry) => {
                          const key =
                            getDictionaryValueEntryKey(entry, dictionaryOptionMap) ||
                            getAttributeKey(
                              entry?.dictionary_value_id ?? entry?.value_id ?? entry?.id
                            );
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

                        const dictionarySelectValue = meta?.is_collection
                          ? selectedDictionaryKeys
                          : selectedDictionaryKeys[0] ?? '';

                        const fallbackValueString = formatAttributeValues(attr.values || []);
                        const textareaValue = isTypeAttribute
                          ? typeInputValue
                          : hasDictionaryOptions
                            ? manualValueString
                            : fallbackValueString;

                        const isLargeField =
                          LARGE_TEXT_ATTRIBUTE_IDS.has(attrKey) ||
                          ['text', 'html', 'richtext'].includes(metaType);
                        const isRequired = Boolean(meta?.is_required);
                        const hasValue = attributeHasValues(attr);
                        const showMissing = isRequired && !hasValue;

                        const rows = isLargeField ? 6 : 3;
                        const textareaMinHeight = isLargeField ? 140 : 70;
                        const textareaProps = hasDictionaryOptions
                          ? {
                              value: manualValueString,
                              onChange: (e) => onManualValueChange?.(idx, attrKey, e.target.value)
                            }
                          : {
                              value: textareaValue,
                              onChange: (e) => onAttributeValueChange?.(idx, attrKey, e.target.value)
                            };

                        return (
                          <div
                            key={`${attrKey}-${aIdx}`}
                            style={{
                              border: `1px solid ${showMissing ? '#f8b4b4' : '#e9ecef'}`,
                              borderRadius: 6,
                              padding: 12,
                              backgroundColor: showMissing ? '#fff5f5' : 'white'
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: 6
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 'bold',
                                  color: showMissing ? '#b91c1c' : 'inherit'
                                }}
                              >
                                {meta?.name || attr.name || `ID ${attrKey}`}
                                {isRequired && (
                                  <span
                                    style={{
                                      marginLeft: 8,
                                      color: showMissing ? '#b91c1c' : '#d97706',
                                      fontSize: 13
                                    }}
                                  >
                                    * Обязательное
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: '#6c757d' }}>ID: {attrKey}</div>
                            </div>
                            {showMissing && (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: '#b91c1c',
                                  marginBottom: 6
                                }}
                              >
                                Заполните это поле перед отправкой в OZON
                              </div>
                            )}
                            {hasDictionaryOptions && (
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 6 }}>
                                  Значения из справочника
                                </div>
                                <select
                                  multiple={!!meta?.is_collection}
                                  value={dictionarySelectValue}
                                  onChange={(e) => {
                                    if (meta?.is_collection) {
                                      const selectedValues = Array.from(
                                        e.target.selectedOptions
                                      ).map((option) => option.value);
                                      onDictionaryValueChange?.(
                                        idx,
                                        attrKey,
                                        selectedValues,
                                        dictionaryOptionMap
                                      );
                                    } else {
                                      const nextValue = e.target.value ? [e.target.value] : [];
                                      onDictionaryValueChange?.(
                                        idx,
                                        attrKey,
                                        nextValue,
                                        dictionaryOptionMap
                                      );
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
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 12,
                                marginTop: 8,
                                fontSize: 11,
                                color: '#6c757d'
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
                              {meta?.is_collection && <span>Можно выбрать несколько значений</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ color: '#6c757d', padding: 20, textAlign: 'center' }}>
          Характеристики не найдены
        </div>
      )}
    </div>
  );
};

export const AttributesModal = ({
  source,
  isOpen,
  profile,
  offerId,
  importState,
  onImportValueChange,
  onImportSave,
  onImportClose,
  fieldMappings,
  onImportSubmit,
  importSubmitDisabled,
  importSubmitLoading,
  onImportMetaChange,
  importBaseValues,
  productsState,
  onProductsRefresh,
  onProductsSave,
  onProductsClose,
  onProductsManualValueChange,
  onProductsAttributeValueChange,
  onProductsDictionaryValueChange,
  onProductsTypeChange,
  onProductsSubmit,
  productsSubmitDisabled,
  productsSubmitLoading,
  onProductsMetaChange,
  priceContextLabel
}) => {
  const [priceInfo, setPriceInfo] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const profileKey = useMemo(() => {
    if (!profile || !profile.id) return '';
    return String(profile.id);
  }, [profile]);

  useEffect(() => {
    if (!isOpen) {
      setPriceInfo(null);
      setPriceLoading(false);
      setPriceError('');
      return;
    }
    if (!profile?.id || !offerId) {
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
          offer_id: offerId,
          profileId: profile.id
        });
        const response = await fetch(`/api/products/info-list?${query.toString()}`);
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Не удалось получить цены');
        }
        const data = await response.json();
        if (!cancelled) {
          const item =
            (Array.isArray(data.items) && data.items.length && data.items[0]) ||
            (Array.isArray(data?.raw?.items) && data.raw.items.length && data.raw.items[0]) ||
            null;
          setPriceInfo(item);
        }
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
  }, [isOpen, offerId, profileKey]);

  useEffect(() => {
    if (!isOpen || !priceInfo) return;

    if (source === 'import' && onImportMetaChange) {
      REQUIRED_BASE_FIELDS.forEach((field) => {
        const existing = importState?.metaValues?.[field];
        if (!hasValue(existing) && hasValue(priceInfo[field])) {
          onImportMetaChange(field, String(priceInfo[field]));
        }
      });
    }

    if (
      source === 'products' &&
      onProductsMetaChange &&
      Array.isArray(productsState?.editableAttributes)
    ) {
      REQUIRED_BASE_FIELDS.forEach((field) => {
        if (!hasValue(priceInfo[field])) return;
        productsState.editableAttributes.forEach((product, idx) => {
          if (!hasValue(product?.[field])) {
            onProductsMetaChange(idx, field, String(priceInfo[field]));
          }
        });
      });
    }
  }, [isOpen, priceInfo, source, onImportMetaChange, importState, onProductsMetaChange, productsState]);

  if (!isOpen) {
    return null;
  }

  const pricePanelProps = {
    priceInfo,
    priceLoading,
    priceError,
    contextLabel: priceContextLabel
  };

  return (
    <div style={overlayStyle}>
      {source === 'products' ? (
        <ProductsAttributesContent
          attributes={productsState?.attributes}
          editableAttributes={productsState?.editableAttributes}
          selectedProduct={productsState?.selectedProduct}
          loadingAttributes={productsState?.loadingAttributes}
          savingAttributes={productsState?.savingAttributes}
          savingAttributesLabel={productsState?.savingAttributesLabel}
          attributesUpdateStatus={productsState?.attributesUpdateStatus}
          onRefresh={onProductsRefresh}
          onSave={onProductsSave}
          onClose={onProductsClose}
          onManualValueChange={onProductsManualValueChange}
          onAttributeValueChange={onProductsAttributeValueChange}
          onDictionaryValueChange={onProductsDictionaryValueChange}
          onTypeIdChange={onProductsTypeChange}
          onSubmit={onProductsSubmit || onProductsSave}
          submitDisabled={productsSubmitDisabled}
          submitLoading={productsSubmitLoading}
          pricePanelProps={pricePanelProps}
          onMetaChange={onProductsMetaChange}
          priceInfo={priceInfo}
        />
      ) : (
        <ImportAttributesContent
          state={importState}
          onClose={onImportClose}
          onSave={onImportSave}
          onValueChange={onImportValueChange}
          fieldMappings={fieldMappings}
          pricePanelProps={pricePanelProps}
          onSubmit={onImportSubmit}
          submitDisabled={importSubmitDisabled}
          submitLoading={importSubmitLoading}
          onMetaChange={onImportMetaChange}
          baseValues={importBaseValues}
          priceInfo={priceInfo}
        />
      )}
    </div>
  );
};

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
  TEXT_ONLY_ATTRIBUTE_IDS,
  normalizeProductAttributes,
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
import { PriceInfoPanel, ImagesManager, MetaFieldsSection } from '../../../src/components/attributes';
import { CategoryTypeSelector } from '../../../src/components/CategoryTypeSelector';

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
  const mode = typeof router.query.mode === 'string' ? router.query.mode : '';
  const isNewMode = mode === 'new';
  const [currentProfile, setCurrentProfile] = useState(null);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [priceInfo, setPriceInfo] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [savingAttributes, setSavingAttributes] = useState(false);
  const [savingLabel, setSavingLabel] = useState('Отправляем...');
  const [attributesUpdateStatus, setAttributesUpdateStatus] = useState({ message: '', error: '' });
  const [comboMetaLoading, setComboMetaLoading] = useState(false);
  const [comboMetaError, setComboMetaError] = useState('');
  const [categoryTree, setCategoryTree] = useState([]);
  const [categoryTreeLoading, setCategoryTreeLoading] = useState(false);
  const [categoryTreeError, setCategoryTreeError] = useState('');
  const [categoryMap, setCategoryMap] = useState(new Map());
  const fetchedComboKeyRef = useRef('');
  const categoryTreeLoadedRef = useRef(false);
  const containerRef = useRef(null);
  const [ratingHints, setRatingHints] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSlidesPreview, setAiSlidesPreview] = useState([]);

  const {
    attributes,
    setAttributes,
    editableAttributes,
    setEditableAttributes,
    loadingAttributes,
    error: attributesError,
    loadAttributes
  } = useProductAttributes(apiClient, currentProfile);

  const buildCategoryTree = useCallback((nodes = []) => {
    const map = new Map();

    const traverse = (node) => {
      if (!node) return null;
      if (node.type_id && node.type_name) {
        return {
          id: String(node.type_id),
          name: node.type_name || `Тип ${node.type_id}`,
          disabled: Boolean(node.disabled),
          isType: true
        };
      }

      if (node.description_category_id) {
        const children = [];
        const types = [];

        (node.children || []).forEach((child) => {
          const result = traverse(child);
          if (!result) return;
          if (result.isType) {
            types.push({
              id: result.id,
              name: result.name,
              disabled: result.disabled
            });
          } else {
            children.push(result);
          }
        });

        const entry = {
          id: String(node.description_category_id),
          name: node.category_name || `Категория ${node.description_category_id}`,
          disabled: Boolean(node.disabled),
          children: children.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' })),
          types: types.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' })),
          isType: false
        };
        map.set(entry.id, entry);
        return entry;
      }

      if (Array.isArray(node.children)) {
        const aggregatedChildren = [];
        node.children.forEach((child) => {
          const result = traverse(child);
          if (result && !result.isType) {
            aggregatedChildren.push(result);
          }
        });
        if (aggregatedChildren.length) {
          const entry = {
            id: `virtual-${Math.random()}`,
            name: node.category_name || 'Категория',
            disabled: Boolean(node.disabled),
            children: aggregatedChildren,
            types: [],
            isType: false
          };
          return entry;
        }
      }

      return null;
    };

    const tree = nodes
      .map((node) => traverse(node))
      .filter(Boolean)
      .map((node) => ({
        ...node,
        children: node.children || []
      }));

    tree.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));

    return { tree, map };
  }, []);

  useEffect(() => {
    setCurrentProfile(ProfileManager.getCurrentProfile());
  }, []);

  useEffect(() => {
    if (categoryTreeLoadedRef.current) return;
    if (!currentProfile?.id) return;
    setCategoryTreeLoading(true);
    setCategoryTreeError('');
    fetch('/api/products/description-tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'RU',
        profileId: currentProfile.id
      })
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Не удалось получить список категорий');
        }
        const treeNodes = Array.isArray(data?.result) ? data.result : [];
        const { tree, map } = buildCategoryTree(treeNodes);
        setCategoryTree(tree);
        setCategoryMap(map);
        categoryTreeLoadedRef.current = true;
        setCategoryTreeLoading(false);
      })
      .catch((error) => {
        console.error('[attributes] Failed to fetch description tree', error);
        setCategoryTreeError(error.message || 'Не удалось получить список категорий');
        setCategoryTreeLoading(false);
      });
  }, [currentProfile, buildCategoryTree]);

  const updateBaseProduct = useCallback(
    (updates) => {
      setAttributes((prev) => {
        if (!prev || !Array.isArray(prev.result) || !prev.result.length) {
          return prev;
        }
        const baseProduct = { ...prev.result[0], ...updates };
        return {
          ...prev,
          result: [baseProduct],
          isNewProduct: prev.isNewProduct
        };
      });
    },
    [setAttributes]
  );

  useEffect(() => {
    if (isNewMode) return;
    if (offer_id && currentProfile) {
      loadAttributes(offer_id);
    }
  }, [offer_id, currentProfile, loadAttributes, isNewMode]);

  useEffect(() => {
    return () => {
      setAttributes(null);
      setEditableAttributes(null);
    };
  }, [setAttributes, setEditableAttributes]);

  useEffect(() => {
    if (!isNewMode) return;
    if (!offer_id) return;
    const offerValue = typeof offer_id === 'string' ? offer_id : '';
    if (!offerValue) return;

    // Попытка восстановить заготовку копии товара
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('attributesCopyDraft');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.offer_id === offerValue && parsed.attributes && parsed.editable) {
            setAttributes(parsed.attributes);
            setEditableAttributes([JSON.parse(JSON.stringify(parsed.editable))]);
            window.localStorage.removeItem('attributesCopyDraft');
            return;
          }
        }
      } catch (e) {
        console.error('[attributes] failed to restore copy draft', e);
      }
    }

    if (attributes?.isNewProduct && editableAttributes?.length) return;

    const emptyProduct = {
      offer_id: offerValue,
      name: '',
      attributes: [],
      description_category_id: '',
      type_id: '',
      images: [],
      primary_image: '',
      available_attributes: []
    };
    setAttributes({ result: [emptyProduct], isNewProduct: true });
    setEditableAttributes([JSON.parse(JSON.stringify(emptyProduct))]);
  }, [isNewMode, offer_id, attributes?.isNewProduct, editableAttributes, setAttributes, setEditableAttributes]);

  const editableProduct = editableAttributes?.[0] || null;
  const isNewProduct = Boolean(attributes?.isNewProduct || isNewMode);
  const selectedOfferId = editableProduct?.offer_id || (typeof offer_id === 'string' ? offer_id : '');

  useEffect(() => {
    if (!offer_id || !currentProfile || isNewProduct) {
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
  }, [offer_id, currentProfile, isNewProduct]);

  const productInfo = useMemo(() => {
    if (!attributes) return null;
    if (Array.isArray(attributes?.result) && attributes.result.length) {
      return attributes.result[0];
    }
    return null;
  }, [attributes]);

  useEffect(() => {
    if (!currentProfile || !productInfo?.sku) {
      setRatingHints(null);
      return;
    }
    let cancelled = false;
    const loadRating = async () => {
      try {
        const response = await fetch('/api/products/rating-by-sku', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus: [productInfo.sku], profileId: currentProfile.id })
        });
        const data = await response.json();
        if (!response.ok) {
          console.warn('[attributes] failed to load rating-by-sku', data);
          if (!cancelled) setRatingHints(null);
          return;
        }
        const entry =
          (Array.isArray(data?.products) && data.products[0]) ||
          (Array.isArray(data?.result) && data.result[0]) ||
          null;
        if (!cancelled) {
          setRatingHints(entry || null);
        }
      } catch (error) {
        console.error('[attributes] rating-by-sku error', error);
        if (!cancelled) {
          setRatingHints(null);
        }
      }
    };
    loadRating();
    return () => {
      cancelled = true;
    };
  }, [currentProfile, productInfo?.sku]);

  useEffect(() => {
    if (!isNewProduct) return;
    const categoryId = editableProduct?.description_category_id;
    const typeId = editableProduct?.type_id;
    if (!hasValue(categoryId) || !hasValue(typeId)) {
      if (comboMetaLoading) {
        setComboMetaLoading(false);
      }
      setComboMetaError('');
      fetchedComboKeyRef.current = '';
      return;
    }
    const comboKey = `${categoryId}:${typeId}`;
    if (fetchedComboKeyRef.current === comboKey && !comboMetaError) {
      return;
    }
    if (!currentProfile) {
      setComboMetaError('Выберите профиль на главной странице, чтобы загрузить характеристики.');
      return;
    }
    let cancelled = false;
    setComboMetaLoading(true);
    setComboMetaError('');
    const body = {
      description_category_id: categoryId,
      type_id: typeId,
      profileId: currentProfile.id
    };
    fetch('/api/products/description-attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Не удалось получить характеристики категории');
        }
        if (cancelled) return;
        const metaAttributes = Array.isArray(data?.attributes) ? data.attributes : [];

        // Обновляем базовый продукт (источник правды для available_attributes)
        setAttributes((prev) => {
          const prevResult = Array.isArray(prev?.result) ? prev.result : [];
          const baseProduct = {
            ...(prevResult[0] || {}),
            available_attributes: metaAttributes,
            description_category_id: categoryId,
            type_id: typeId
          };
          return {
            ...(prev || {}),
            result: [baseProduct],
            isNewProduct: true
          };
        });

        // Строим полный список характеристик для редактирования
        const sourceProductForEdit = {
          ...(editableProduct || {}),
          available_attributes: metaAttributes,
          description_category_id: categoryId,
          type_id: typeId
        };
        const normalizedList = normalizeProductAttributes([sourceProductForEdit]);
        const normalizedEditable = normalizedList[0] || sourceProductForEdit;
        setEditableAttributes([JSON.parse(JSON.stringify(normalizedEditable))]);

        fetchedComboKeyRef.current = comboKey;
        setComboMetaLoading(false);
        setComboMetaError('');
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[attributes] Failed to fetch description attributes', error);
        setComboMetaLoading(false);
        setComboMetaError(error.message || 'Не удалось получить характеристики категории');
      });

    return () => {
      cancelled = true;
    };
  }, [
    isNewProduct,
    editableProduct?.description_category_id,
    editableProduct?.type_id,
    setAttributes,
    setEditableAttributes,
    comboMetaLoading,
    comboMetaError,
    currentProfile
  ]);

  const availableAttributesMeta = useMemo(() => {
    const source = Array.isArray(productInfo?.available_attributes)
      ? productInfo.available_attributes
      : [];
    return source.filter((meta) => {
      const key = getAttributeKey(meta?.id ?? meta?.attribute_id);
      return key && key !== TYPE_ATTRIBUTE_ID;
    });
  }, [productInfo]);

  const superRecommendedAttributeKeys = useMemo(() => {
    if (!ratingHints || !Array.isArray(ratingHints.groups)) {
      return new Set();
    }
    const keys = new Set();
    ratingHints.groups.forEach((group) => {
      const attrs = Array.isArray(group?.improve_attributes)
        ? group.improve_attributes
        : [];
      attrs.forEach((attr) => {
        if (!attr) return;
        const rawId =
          attr.attribute_id ??
          attr.attributeId ??
          attr.id;
        if (rawId !== undefined && rawId !== null && rawId !== '') {
          const key = getAttributeKey(rawId);
          if (key) {
            keys.add(key);
            return;
          }
        }
        const name = String(attr.name || '').trim();
        if (!name) return;
        const meta = availableAttributesMeta.find(
          (entry) => String(entry?.name || '').trim() === name
        );
        if (meta) {
          const key = getAttributeKey(meta?.id ?? meta?.attribute_id);
          if (key) {
            keys.add(key);
          }
        }
      });
    });
    return keys;
  }, [ratingHints, availableAttributesMeta]);

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
      .filter((attr) => attr.__attrKey && attr.__attrKey !== TYPE_ATTRIBUTE_ID)
      .sort((a, b) => {
        const metaA = attributeMetaMap.get(a.__attrKey);
        const metaB = attributeMetaMap.get(b.__attrKey);
        const reqA = metaA?.is_required ? 1 : 0;
        const reqB = metaB?.is_required ? 1 : 0;
        if (reqA !== reqB) {
          return reqA ? -1 : 1;
        }
        const superA = superRecommendedAttributeKeys.has(a.__attrKey) ? 1 : 0;
        const superB = superRecommendedAttributeKeys.has(b.__attrKey) ? 1 : 0;
        if (superA !== superB) {
          return superA ? -1 : 1;
        }
        return attributeComparator(a, b);
      });
  }, [editableProduct, attributeMetaMap, superRecommendedAttributeKeys]);

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
          hasRequired: false,
          hasSuperRecommended: false
        });
      }
      const group = map.get(groupName);
      group.attributes.push({ attr, meta });
      if (meta?.is_required) {
        group.hasRequired = true;
      }
      if (superRecommendedAttributeKeys.has(attr.__attrKey)) {
        group.hasSuperRecommended = true;
      }
    });
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      if (a.hasRequired !== b.hasRequired) {
        return a.hasRequired ? -1 : 1;
      }
      if (a.hasSuperRecommended !== b.hasSuperRecommended) {
        return a.hasSuperRecommended ? -1 : 1;
      }
      return a.label.localeCompare(b.label, 'ru');
    });
    return groups;
  }, [attributeList, attributeMetaMap, superRecommendedAttributeKeys]);

  const requiredAttributeCount = useMemo(() => {
    return availableAttributesMeta.filter((meta) => meta?.is_required).length;
  }, [availableAttributesMeta]);

  const missingRequiredCount = useMemo(() => {
    return attributeList.filter((attr) => {
      const meta = attributeMetaMap.get(attr.__attrKey);
      return meta?.is_required && !attributeHasValues(attr);
    }).length;
  }, [attributeList, attributeMetaMap]);


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

  const resetAttributesForNewSelection = useCallback(() => {
    setEditableAttributes((prev) => {
      if (!prev) return prev;
      return prev.map((product, idx) => {
        if (idx !== PRIMARY_PRODUCT_INDEX) return product;
        return {
          ...product,
          attributes: []
        };
      });
    });
  }, [setEditableAttributes]);

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

  const handleCategorySelect = useCallback(
    (value) => {
      const normalized = value || '';
      handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'description_category_id', normalized);
      handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'type_id', '');
      updateBaseProduct({
        description_category_id: normalized,
        type_id: '',
        available_attributes: []
      });
      resetAttributesForNewSelection();
      fetchedComboKeyRef.current = '';
      setComboMetaError('');
    },
    [handleProductMetaChange, updateBaseProduct, resetAttributesForNewSelection]
  );

  const handleTypeSelect = useCallback(
    (value) => {
      const normalized = value || '';
      handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'type_id', normalized);
      updateBaseProduct({
        type_id: normalized,
        available_attributes: []
      });
      resetAttributesForNewSelection();
      fetchedComboKeyRef.current = '';
      setComboMetaError('');
    },
    [handleProductMetaChange, updateBaseProduct, resetAttributesForNewSelection]
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
  const baseFieldIssues = useMemo(() => {
    if (!editableProduct) return [];
    const issues = [];
    REQUIRED_BASE_FIELDS.forEach((field) => {
      const value = editableProduct[field];
      if (!hasValue(value)) {
        issues.push(field);
        return;
      }
      if (NUMERIC_BASE_FIELDS.includes(field)) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          issues.push(field);
        }
      }
    });
    return issues;
  }, [editableProduct]);
  const combinedBaseValues = useMemo(() => ({ ...(priceInfo || {}), ...(productInfo || {}) }), [
    priceInfo,
    productInfo
  ]);
  const hasCategorySelection = hasValue(editableProduct?.description_category_id);
  const hasTypeSelection = hasValue(editableProduct?.type_id);
  const canDisplayAttributesSection =
    !isNewProduct || (hasCategorySelection && hasTypeSelection && !comboMetaLoading && !comboMetaError);

  const normalizeHashtagsValue = useCallback((rawList) => {
    if (!Array.isArray(rawList) || !rawList.length) return [];
    const result = [];
    const seen = new Set();
    rawList.forEach((raw) => {
      if (!raw) return;
      let tag = String(raw).trim().toLowerCase();
      // убираем обёртки и лишние символы
      tag = tag.replace(/^[#\s]+/, '');
      // оставляем только буквы, цифры и подчёркивания (русские + латиница)
      tag = tag.replace(/[^0-9a-zа-яё_]+/gi, '_');
      tag = tag.replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
      if (!tag) return;
      tag = `#${tag}`;
      if (tag.length > 30) {
        tag = tag.slice(0, 30);
      }
      if (!/^#[0-9a-zа-яё_]{1,29}$/i.test(tag)) return;
      if (!seen.has(tag)) {
        seen.add(tag);
        result.push(tag);
      }
    });
    return result.slice(0, 25);
  }, []);

  const buildAiProductPayload = useCallback(() => {
    if (!editableProduct) return null;

    const attributesMap = {};
    attributeList.forEach((attr) => {
      const meta = attributeMetaMap.get(attr.__attrKey);
      const name = meta?.name || attr.name || `attribute_${attr.__attrKey}`;
      const value = formatAttributeValues(attr.values || []);
      if (!value) return;
      attributesMap[name] = value;
    });

    const brandMeta = availableAttributesMeta.find(
      (meta) => String(meta?.name || '').toLowerCase() === 'бренд'
    );
    let brand = '';
    if (brandMeta) {
      const brandKey = getAttributeKey(brandMeta.id ?? brandMeta.attribute_id);
      const brandAttr = attributeList.find((attr) => attr.__attrKey === brandKey);
      if (brandAttr) {
        brand = formatAttributeValues(brandAttr.values || []) || '';
      }
    }

    const price = editableProduct.price ?? priceInfo?.price ?? productInfo?.price ?? null;
    const vat = editableProduct.vat ?? productInfo?.vat ?? null;

    return {
      offer_id: editableProduct.offer_id || (typeof offer_id === 'string' ? offer_id : ''),
      name: editableProduct.name || productInfo?.name || '',
      category_id:
        editableProduct.description_category_id ||
        productInfo?.description_category_id ||
        editableProduct.descriptionCategoryId ||
        '',
      type_id: editableProduct.type_id || productInfo?.type_id || editableProduct.typeId || '',
      brand,
      images: Array.isArray(editableProduct.images)
        ? editableProduct.images
        : Array.isArray(productInfo?.images)
        ? productInfo.images
        : [],
      price,
      vat,
      section: productInfo?.section || '',
      attributes: attributesMap,
      seo_keywords: '',
      withWatermark: false,
      watermarkText: ''
    };
  }, [
    editableProduct,
    attributeList,
    attributeMetaMap,
    availableAttributesMeta,
    offer_id,
    priceInfo,
    productInfo
  ]);

  const callAiForMode = useCallback(
    async (mode) => {
      const productPayload = buildAiProductPayload();
      if (!productPayload) {
        alert('Нет данных товара для отправки в AI');
        return null;
      }
      setAiLoading(true);
      try {
        const response = await fetch('/api/ai/product-seo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: productPayload, mode })
        });
        const data = await response.json();
        console.log('[AI] mode =', mode, 'request product:', productPayload);
        console.log('[AI] mode =', mode, 'response:', data);
        if (!response.ok) {
          console.error('[AI] error for mode', mode, data);
          throw new Error(data?.error || `AI error for mode ${mode}`);
        }
        return data;
      } catch (error) {
        console.error('[AI] send error', error);
        alert('Ошибка при обращении к AI. Подробности в консоли.');
        return null;
      } finally {
        setAiLoading(false);
      }
    },
    [buildAiProductPayload]
  );

  const handleAiSeoName = useCallback(async () => {
    const data = await callAiForMode('seo-name');
    if (!data || !Array.isArray(data.items) || !data.items.length) return;
    const first = data.items[0];
    const titles = Array.isArray(first.titles)
      ? first.titles
      : typeof first.description === 'string'
      ? String(first.description)
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const bestTitle = titles[0];
    if (bestTitle) {
      handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'name', bestTitle);
    }
  }, [callAiForMode, handleProductMetaChange]);

  const handleAiDescription = useCallback(async () => {
    const data = await callAiForMode('description');
    if (!data || !Array.isArray(data.items) || !data.items.length) return;
    const first = data.items[0];
    const text = String(first.text || '').trim();
    if (!text) return;
    handleAttributeValueChange(PRIMARY_PRODUCT_INDEX, 4191, text);
  }, [callAiForMode, handleAttributeValueChange]);

  const handleAiHashtags = useCallback(async () => {
    const data = await callAiForMode('hashtags');
    if (!data || !Array.isArray(data.items) || !data.items.length) return;
    const first = data.items[0];
    const hashtags = Array.isArray(first.hashtags)
      ? first.hashtags.map((h) => String(h || '').trim()).filter(Boolean)
      : [];
    const normalized = normalizeHashtagsValue(hashtags);
    if (!normalized.length) {
      alert('AI не сгенерировал валидные хештеги по правилам OZON.');
      return;
    }
    const value = normalized.join(', ');
    handleAttributeValueChange(PRIMARY_PRODUCT_INDEX, 23171, value);
  }, [callAiForMode, handleAttributeValueChange, normalizeHashtagsValue]);

  const handleAiRich = useCallback(async () => {
    const data = await callAiForMode('rich');
    if (!data || !Array.isArray(data.items) || !data.items.length) return;
    const first = data.items[0];
    const content = first.content || {};
    const json = JSON.stringify(content, null, 2);
    handleAttributeValueChange(PRIMARY_PRODUCT_INDEX, 11254, json);
  }, [callAiForMode, handleAttributeValueChange]);

  const handleAiSlides = useCallback(async () => {
    const data = await callAiForMode('slides');
    if (!data || !Array.isArray(data.items) || !data.items.length) return;
    const first = data.items[0];
    const slides = Array.isArray(first.slides) ? first.slides : [];
    if (!slides.length) return;
    const json = JSON.stringify(slides, null, 2);
    setAiSlidesPreview(slides);
    // Дополнительно пишем слайды в Rich-контент JSON для визуального просмотра/экспорта
    handleAttributeValueChange(PRIMARY_PRODUCT_INDEX, 11254, json);
  }, [callAiForMode, handleAttributeValueChange]);

  const handleAiSlidesGenerateImages = useCallback(async () => {
    if (!aiSlidesPreview || !aiSlidesPreview.length) {
      alert('Сначала получите структуру слайдов через кнопку «AI слайды».');
      return;
    }
    try {
      setAiLoading(true);
      const response = await fetch('/api/ai/slide-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: aiSlidesPreview,
          offerId: editableProduct?.offer_id || offer_id,
          productName: editableProduct?.name || productInfo?.name || ''
        })
      });
      const data = await response.json();
      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.error('AI slide image generation error', data);
        // eslint-disable-next-line no-alert
        alert(data?.error || 'Не удалось создать изображения слайдов');
        return;
      }

      const urls = Array.isArray(data?.items)
        ? data.items
            .map((item) => String(item.url || '').trim())
            .filter(Boolean)
        : [];

      if (urls.length) {
        const existing = Array.isArray(editableProduct?.images)
          ? editableProduct.images
          : [];
        const merged = [...existing, ...urls];
        handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'images', merged);
        // eslint-disable-next-line no-alert
        alert(`Добавлено слайдов изображений: ${urls.length}`);
      } else {
        // eslint-disable-next-line no-alert
        alert('Не удалось создать изображения слайдов');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('AI slide image generation error', error);
      // eslint-disable-next-line no-alert
      alert('Ошибка генерации слайдов. Подробности в консоли.');
    } finally {
      setAiLoading(false);
    }
  }, [aiSlidesPreview, editableProduct, handleProductMetaChange]);

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
    if (isNewProduct) {
      if (!hasValue(editableProduct?.offer_id)) {
        alert('Укажите offer_id для нового товара');
        return;
      }
      if (
        !hasValue(editableProduct?.description_category_id) ||
        !hasValue(editableProduct?.type_id)
      ) {
        alert('Укажите категорию описания и type_id для нового товара');
        return;
      }
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
  }, [currentProfile, selectedOfferId, sanitizeItemsForUpdate, isNewProduct, editableProduct]);

  const handleRefreshClick = useCallback(() => {
    if (!selectedOfferId) {
      alert('Не удалось определить товар для обновления');
      return;
    }
    setAttributesUpdateStatus({ message: '', error: '' });
    loadAttributes(selectedOfferId);
  }, [selectedOfferId, loadAttributes]);

  const hasOfferValue = hasValue(editableProduct?.offer_id);
  const canSaveNewProduct =
    !isNewProduct ||
    (hasOfferValue &&
      hasCategorySelection &&
      hasTypeSelection &&
      !comboMetaLoading &&
      !comboMetaError &&
      !categoryTreeLoading &&
      !categoryTreeError);
  const isSaveDisabled =
    savingAttributes || !editableProduct || loadingAttributes || !hasOfferValue || !canSaveNewProduct;

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
            marginBottom: 24,
            position: 'sticky',
            top: 0,
            zIndex: 30,
            backgroundColor: '#f8fafc',
            padding: '16px 0',
            borderBottom: '1px solid #e2e8f0',
            boxShadow: '0 4px 12px rgba(15,23,42,0.08)'
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
            <div
              style={{
                display: 'grid',
                gap: 12,
                width: '100%',
                marginTop: 12
              }}
            >
              <label style={{ fontSize: 13, color: '#475569' }}>
                Название
                <input
                  type="text"
                  value={editableProduct?.name || ''}
                  onChange={(event) =>
                    handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'name', event.target.value)
                  }
                  style={{
                    ...inputStyle,
                    marginTop: 6,
                    padding: '12px 16px',
                    borderRadius: 9999,
                    border: '1px solid #e2e8f0'
                  }}
                  placeholder="Введите название товара"
                />
              </label>
              <div style={{ fontSize: 13, color: '#475569' }}>
                <label>Категория и тип *</label>
                <div style={{ marginTop: 6 }}>
                  <CategoryTypeSelector
                    disabled={!isNewProduct}
                    value={{
                      categoryId: editableProduct?.description_category_id
                        ? String(editableProduct.description_category_id)
                        : '',
                      typeId: editableProduct?.type_id ? String(editableProduct.type_id) : ''
                    }}
                    tree={categoryTree}
                    categoryMap={categoryMap}
                    loading={categoryTreeLoading}
                    error={categoryTreeError}
                    onChange={({ categoryId, typeId }) => {
                      handleCategorySelect(categoryId);
                      handleTypeSelect(typeId);
                    }}
                  />
                </div>
              </div>
              <label style={{ fontSize: 13, color: '#475569' }}>
                Артикул (offer_id)
                <input
                  type="text"
                  value={editableProduct?.offer_id || ''}
                  onChange={(event) =>
                    handleProductMetaChange(PRIMARY_PRODUCT_INDEX, 'offer_id', event.target.value)
                  }
                  disabled={!isNewProduct}
                  style={{
                    ...inputStyle,
                    marginTop: 6,
                    padding: '12px 16px',
                    borderRadius: 9999,
                    border: '1px solid #e2e8f0',
                    backgroundColor: isNewProduct ? '#fff' : '#f8fafc'
                  }}
                  placeholder="Введите offer_id"
                />
              </label>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              marginTop: 20,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAiSeoName}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  cursor: aiLoading || !editableProduct ? 'not-allowed' : 'pointer',
                  fontSize: 12
                }}
                disabled={aiLoading || !editableProduct}
              >
                AI SEO‑название
              </button>
              <button
                type="button"
                onClick={handleAiDescription}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  cursor: aiLoading || !editableProduct ? 'not-allowed' : 'pointer',
                  fontSize: 12
                }}
                disabled={aiLoading || !editableProduct}
              >
                AI описание
              </button>
              <button
                type="button"
                onClick={handleAiHashtags}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  cursor: aiLoading || !editableProduct ? 'not-allowed' : 'pointer',
                  fontSize: 12
                }}
                disabled={aiLoading || !editableProduct}
              >
                AI хештеги
              </button>
              <button
                type="button"
                onClick={handleAiRich}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  cursor: aiLoading || !editableProduct ? 'not-allowed' : 'pointer',
                  fontSize: 12
                }}
                disabled={aiLoading || !editableProduct}
              >
                AI Rich JSON
              </button>
              <button
                type="button"
                onClick={handleAiSlides}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  cursor: aiLoading || !editableProduct ? 'not-allowed' : 'pointer',
                  fontSize: 12
                }}
                disabled={aiLoading || !editableProduct}
              >
                AI слайды
              </button>
              <button
                type="button"
                onClick={handleAiSlidesGenerateImages}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #fed7aa',
                  backgroundColor: '#fffbeb',
                  color: '#b45309',
                  cursor: aiLoading || !editableProduct ? 'not-allowed' : 'pointer',
                  fontSize: 12
                }}
                disabled={aiLoading || !editableProduct}
              >
                Сделать изображения слайдов
              </button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
          </div>
        </header>
        {!isNewProduct && (
          <PriceInfoPanel
            priceInfo={priceInfo}
            priceLoading={priceLoading}
            priceError={priceError}
            contextLabel={selectedOfferId ? `Товар ${selectedOfferId}` : 'Цены товара'}
          />
        )}
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
          {isNewProduct && !hasCategorySelection && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: '#fef3c7',
                border: '1px solid #fde68a',
                color: '#92400e',
                fontSize: 13
              }}
            >
              Сначала выберите категорию описания.
            </div>
          )}
          {isNewProduct && hasCategorySelection && !hasTypeSelection && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: '#fef3c7',
                border: '1px solid #fde68a',
                color: '#92400e',
                fontSize: 13
              }}
            >
              Теперь укажите type_id для выбранной категории.
            </div>
          )}
          {comboMetaLoading && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: '#e0f2fe',
                border: '1px solid #bae6fd',
                color: '#0c4a6e',
                fontSize: 13
              }}
            >
              Загружаем характеристики для выбранной категории...
            </div>
          )}
          {comboMetaError && (
            <div
              style={{
                marginBottom: 12,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: '#fee2e2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: 13
              }}
            >
              {comboMetaError}
            </div>
          )}
          {canDisplayAttributesSection && (
            <>
              <MetaFieldsSection
                values={editableProduct}
                onChange={(field, value) =>
                  handleProductMetaChange(PRIMARY_PRODUCT_INDEX, field, value)
                }
                baseValues={combinedBaseValues}
              />
              {baseFieldIssues.length > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    borderRadius: 8,
                    backgroundColor: '#fff7ed',
                    color: '#b45309',
                    border: '1px solid #fcd34d',
                    fontSize: 13
                  }}
                >
                  Заполните/исправьте поля:{' '}
                  {baseFieldIssues
                    .map((field) => BASE_FIELD_LABELS[field] || field)
                    .join(', ')}
                </div>
              )}
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
            </>
          )}
          {!canDisplayAttributesSection && !comboMetaLoading && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: '#fff7ed',
                color: '#b45309',
                border: '1px solid #fcd34d',
                fontSize: 13
              }}
            >
              Укажите категорию и type_id, чтобы продолжить заполнение карточки.
            </div>
          )}
        </section>
        {canDisplayAttributesSection && (
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
            {!currentImages.length && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: 13
                }}
              >
                Добавьте хотя бы одно изображение, иначе OZON не примет карточку.
              </div>
            )}
            {mediaFiles.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                Файлов в буфере: {mediaFiles.length}. Их ссылки появятся после загрузки через менеджер.
              </div>
            )}
          </section>
        )}
        {aiSlidesPreview && aiSlidesPreview.length > 0 && (
          <section style={sectionStyle}>
            <SectionHeader title="AI слайды (черновик)" />
            <p style={{ color: '#475569', fontSize: 13, marginBottom: 12 }}>
              Ниже — текстовая структура слайдов для визуального дизайна. Каждый слайд можно
              использовать как основу для отдельного изображения.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {aiSlidesPreview.map((slide, index) => (
                <div
                  key={index}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: 12,
                    backgroundColor: '#f9fafb'
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {slide.title || `Слайд ${index + 1}`}
                  </div>
                  {slide.subtitle && (
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
                      {slide.subtitle}
                    </div>
                  )}
                  {Array.isArray(slide.bullets) && slide.bullets.length > 0 && (
                    <ul
                      style={{
                        paddingLeft: 18,
                        margin: '4px 0',
                        fontSize: 13,
                        color: '#374151'
                      }}
                    >
                      {slide.bullets.map((bullet, idx) => (
                        <li key={idx}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                  {slide.imageIdea && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: '#6b7280'
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>Идея изображения:</span>{' '}
                      {slide.imageIdea}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {canDisplayAttributesSection ? (
          <>
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
                    const forceTextOnly = TEXT_ONLY_ATTRIBUTE_IDS.has(attrKey);

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
                const hasDictionaryOptions = !forceTextOnly && dictionaryOptions.length > 1;
                const textareaValue = hasDictionaryOptions
                  ? manualValueString || fallbackValueString
                  : fallbackValueString;
                const isLargeField =
                  LARGE_TEXT_ATTRIBUTE_IDS.has(attrKey) ||
                  ['text', 'html', 'richtext'].includes((meta?.type || '').toLowerCase());
                const nameLower = String(meta?.name || attr.name || '').toLowerCase();
                const isRichContentAttr =
                  attrKey === '11254' ||
                  nameLower.includes('rich-контент') ||
                  nameLower.includes('rich-контент json') ||
                  nameLower.includes('rich-content');
                const isQuantityLike =
                  !isLargeField &&
                  !isRichContentAttr &&
                  (nameLower.startsWith('количество') || nameLower.includes(' количество'));
                const isRequired = Boolean(meta?.is_required);
                const isSuperRecommended = superRecommendedAttributeKeys.has(attrKey);
                const hasValue = attributeHasValues(attr);
                const rows = isRichContentAttr ? 14 : isLargeField ? 6 : isQuantityLike ? 1 : 3;
                const textareaProps = hasDictionaryOptions
                  ? {
                      value: textareaValue,
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
                      border: `1px solid ${
                        isRequired && !hasValue
                          ? '#f8b4b4'
                          : isSuperRecommended
                          ? '#bfdbfe'
                          : '#e2e8f0'
                      }`,
                      borderRadius: 8,
                      padding: 16,
                      backgroundColor: isRequired && !hasValue
                        ? '#fff7ed'
                        : isSuperRecommended
                        ? '#eff6ff'
                        : '#fff'
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
                        {!isRequired && isSuperRecommended && (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 9999,
                              backgroundColor: '#dbeafe',
                              color: '#1d4ed8'
                            }}
                          >
                            Важно для контент‑рейтинга
                          </span>
                        )}
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
                        minHeight: isRichContentAttr ? 260 : isLargeField ? 140 : isQuantityLike ? 40 : 90,
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
          </>
        ) : (
          isNewProduct && (
            <section style={sectionStyle}>
              <SectionHeader title="Характеристики" />
              <div style={{ color: '#475569' }}>
                Атрибуты появятся после выбора категории и type_id.
              </div>
            </section>
          )
        )}
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

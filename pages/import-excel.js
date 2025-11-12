import { useState, useRef, useEffect, Fragment, useMemo } from 'react';
import { OzonApiService } from '../src/services/ozon-api';
import { ProfileManager } from '../src/utils/profileManager';
import translationService from '../src/services/TranslationService';
import { useProductAttributes } from '../src/hooks/useProductAttributes';
import { apiClient } from '../src/services/api-client';
import {
  PRICE_FIELDS,
  DIMENSION_FIELDS,
  REQUIRED_BASE_FIELDS,
  NUMERIC_BASE_FIELDS,
  BASE_FIELD_LABELS
} from '../src/constants/productFields';
import { TYPE_ATTRIBUTE_ID, TYPE_ATTRIBUTE_NUMERIC } from '../src/utils/attributesHelpers';
import { AttributesModal } from '../src/components/attributes';
import { useWarehouses } from '../src/hooks/useWarehouses';
import { buildImportStatusSummary, logImportStatusSummary } from '../src/utils/importStatus';

const STATUS_CHECK_DELAY_MS = 3000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const appendImportLog = async ({
  offerId,
  status,
  durationMs,
  errorMessage,
  taskId,
  userName
}) => {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offer_id: offerId || '',
        endpoint: '/v3/product/import',
        method: 'POST',
        status: status ?? null,
        duration_ms: durationMs ?? null,
        error_message: errorMessage || null,
        user_id: userName || 'local-user',
        task_id: taskId || null
      })
    });
  } catch (logError) {
    console.error('[ImportExcel] Failed to append import log', logError);
  }
};

// Сервис для работы с шаблонами
const TemplateService = {
  async loadTemplates(templateName = 'ozon-templates') {
    try {
      console.log('Начинаем загрузку шаблонов...');
      const response = await fetch(`/field-templates/${templateName}.json`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const templates = await response.json();
      console.log('Шаблоны успешно загружены:', templates);
      return templates;
    } catch (error) {
      console.error('Ошибка загрузки шаблонов:', error);
      throw error;
    }
  },

  // Сохранение шаблонов в localStorage
  saveTemplatesToLocal(templates, templateName = 'ozon-templates') {
    try {
      localStorage.setItem(`templates_${templateName}`, JSON.stringify(templates));
      console.log('Шаблоны сохранены в localStorage');
      return true;
    } catch (error) {
      console.error('Ошибка сохранения шаблонов:', error);
      return false;
    }
  },

  // Загрузка шаблонов из localStorage
  loadTemplatesFromLocal(templateName = 'ozon-templates') {
    try {
      const saved = localStorage.getItem(`templates_${templateName}`);
      if (saved) {
        return JSON.parse(saved);
      }
      return null;
    } catch (error) {
      console.error('Ошибка загрузки из localStorage:', error);
      return null;
    }
  },

  // Загрузка шаблонов из файла (игнорируя localStorage)
  async loadTemplatesFromFile(templateName = 'ozon-templates') {
    try {
      console.log('Принудительная загрузка шаблонов из файла...');
      const templates = await this.loadTemplates(templateName);
      // Сохраняем в localStorage для будущего использования
      this.saveTemplatesToLocal(templates, templateName);
      return templates;
    } catch (error) {
      console.error('Ошибка загрузки шаблонов из файла:', error);
      throw error;
    }
  },

  // Сохранение пользовательских значений brand_code и ru_color_name
  saveUserValues(userValues) {
    try {
      localStorage.setItem('user_template_values', JSON.stringify(userValues));
      return true;
    } catch (error) {
      console.error('Ошибка сохранения пользовательских значений:', error);
      return false;
    }
  },

  // Загрузка пользовательских значений
  loadUserValues() {
    try {
      const saved = localStorage.getItem('user_template_values');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error('Ошибка загрузки пользовательских значений:', error);
      return {};
    }
  },

  // Экспорт шаблонов в файл
  exportTemplates(templates, filename = 'ozon-templates.json') {
    const dataStr = JSON.stringify(templates, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = filename;
    link.click();

    URL.revokeObjectURL(link.href);
  }
};

// Хук для работы с шаблонами
const useFieldTemplates = () => {
  const [fieldMappings, setFieldMappings] = useState({});
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [userValues, setUserValues] = useState({});

  useEffect(() => {
    loadTemplates();
    loadUserValues();
  }, []);

  const loadTemplates = async () => {
    try {
      setTemplatesLoading(true);
      setTemplatesError(null);
      console.log('Запуск загрузки шаблонов...');

      // Сначала пробуем загрузить из localStorage
      const savedTemplates = TemplateService.loadTemplatesFromLocal();

      if (savedTemplates) {
        console.log('Загружены сохраненные шаблоны из localStorage');
        setFieldMappings(savedTemplates);
      } else {
        // Если в localStorage нет, загружаем из файла
        const templates = await TemplateService.loadTemplates('ozon-templates');
        setFieldMappings(templates);
      }

      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Ошибка в хуке useFieldTemplates:', error);
      setTemplatesError(error.message);

      // Запасной вариант - базовые шаблоны
      console.log('Используем запасные шаблоны...');
      const fallbackTemplates = getFallbackTemplates();
      setFieldMappings(fallbackTemplates);
    } finally {
      setTemplatesLoading(false);
      console.log('Загрузка шаблонов завершена, loading:', false);
    }
  };

  const loadTemplatesFromFile = async () => {
    try {
      setTemplatesLoading(true);
      setTemplatesError(null);
      console.log('Принудительная загрузка шаблонов из файла...');

      const templates = await TemplateService.loadTemplatesFromFile('ozon-templates');
      setFieldMappings(templates);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Ошибка загрузки шаблонов из файла:', error);
      setTemplatesError(error.message);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const loadUserValues = () => {
    const savedValues = TemplateService.loadUserValues();
    setUserValues(savedValues);
  };

  const updateFieldTemplate = (fieldKey, template) => {
    setFieldMappings(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        template: template
      }
    }));
    setHasUnsavedChanges(true);
  };

  const toggleField = (fieldKey) => {
    setFieldMappings(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        enabled: !prev[fieldKey].enabled
      }
    }));
    setHasUnsavedChanges(true);
  };

  const updateUserValue = (key, value) => {
    setUserValues(prev => {
      const newValues = {
        ...prev,
        [key]: value
      };
      TemplateService.saveUserValues(newValues);
      return newValues;
    });
  };

  const saveTemplates = () => {
    const success = TemplateService.saveTemplatesToLocal(fieldMappings);
    if (success) {
      setHasUnsavedChanges(false);
    }
    return success;
  };

  const exportTemplates = () => {
    TemplateService.exportTemplates(fieldMappings);
  };

  const resetToDefault = async () => {
    try {
      setTemplatesLoading(true);
      // Удаляем сохраненные шаблоны
      localStorage.removeItem('templates_ozon-templates');
      // Загружаем оригинальные шаблоны
      const templates = await TemplateService.loadTemplates('ozon-templates');
      setFieldMappings(templates);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Ошибка сброса шаблонов:', error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  return {
    fieldMappings,
    templatesLoading,
    templatesError,
    hasUnsavedChanges,
    userValues,
    updateFieldTemplate,
    toggleField,
    updateUserValue,
    saveTemplates,
    exportTemplates,
    resetToDefault,
    loadTemplatesFromFile,
    reloadTemplates: loadTemplates
  };
};

// Запасные шаблоны вынесены в отдельную функцию для переиспользования
const getFallbackTemplates = () => ({
  "offer_id": {
    "name": "Артикул",
    "template": "PL-ko {brand_code} {car_brand} {colour_code}",
    "attributeId": null,
    "enabled": true,
    "required": true
  },
  "name": {
    "name": "Название товара",
    "template": "{colour_code} Краска для {car_brand} ({ru_car_brand}) {colour_name} {ru_color_name}, 30 мл Эмаль автомобильная, ремонтная, с кисточкой, для сколов и царапин",
    "attributeId": null,
    "enabled": true,
    "required": true
  },
  "brand": {
    "name": "Бренд",
    "template": "Plasti kote",
    "attributeId": 85,
    "enabled": true,
    "required": true
  },
  "model_name": {
    "name": "Название модели",
    "template": "Plasti kote {car_brand}",
    "attributeId": 9048,
    "enabled": true,
    "required": false
  },
  "color_code": {
    "name": "Цвет товара",
    "template": "{ozon_color_name}",
    "attributeId": 10096,
    "enabled": true,
    "required": false
  },
  "color_name": {
    "name": "Название цвета",
    "template": "{colour_name}",
    "attributeId": 10097,
    "enabled": true,
    "required": false
  },
  "car_brand": {
    "name": "Марка ТС",
    "template": "{car_brand}",
    "attributeId": 7204,
    "enabled": true,
    "required": false
  },
  "part_number": {
    "name": "Партномер",
    "template": "{colour_code}",
    "attributeId": 7236,
    "enabled": true,
    "required": false
  },
  "alternative_offers": {
    "name": "Альтернативные артикулы",
    "template": "{car_brand} {colour_code}",
    "attributeId": 11031,
    "enabled": true,
    "required": false
  },
  "brand_code": {
    "name": "Код бренда",
    "template": "{brand_code}",
    "attributeId": null,
    "enabled": true,
    "required": false
  },
  "ru_color_name": {
    "name": "Русское название цвета",
    "template": "{ru_color_name}",
    "attributeId": null,
    "enabled": true,
    "required": false
  },
  "ozon_color_name": {
    "name": "Цвет OZON",
    "template": "{ozon_color_name}",
    "attributeId": null,
    "enabled": true,
    "required": false
  },
  "hashtags": {
    "name": "#Хештеги",
    "template": "",
    "attributeId": 23171,
    "enabled": true,
    "required": false
  },
  "rich_content_json": {
    "name": "Rich-контент JSON",
    "template": "",
    "attributeId": 11254,
    "enabled": true,
    "required": false
  },
  "description": {
    "name": "SEO названия",
    "template": "",
    "attributeId": 4191,
    "enabled": true,
    "required": false
  }
});
const getFieldWidth = (fieldKey) => {
  const widthMap = {
    offer_id: '120px',
    brand: '120px',
    color_code: '100px',
    color_name: '120px',
    car_brand: '120px',
    part_number: '100px',
    brand_code: '100px',
    ru_color_name: '150px',
    ozon_color_name: '150px',
    hashtags: '220px',
    rich_content_json: '260px',
    model_name: '180px',
    alternative_offers: '200px',
    name: '400px',
    description: '450px',
  };

  return widthMap[fieldKey] || '150px'; // Значение по умолчанию
};

const HIDDEN_TEMPLATE_FIELDS = [];

const TEMPLATE_ALLOWED_FIELDS = new Set([
  'barcode',
  'description',
  'price',
  'old_price',
  'premium_price',
  'vat',
  'currency_code',
  'images',
  'marketing_images',
  'images360',
  'pdf_list',
  'certificate',
  'documents',
  'complex_attributes',
  'attributes',
  'complex_attributes',
  'image_group_id',
  'primary_image',
  'images_source',
  'height',
  'length',
  'width',
  'depth',
  'weight',
  'weight_unit',
  'dimension_unit',
  'package_width',
  'package_height',
  'package_length',
  'package_depth',
  'service',
  'delivery_schema',
  'category_id',
  'type_id',
  'group_id',
  'color_image',
  'country_of_origin',
  'hazard_class',
  'is_kgt',
  'is_prepayment',
  'min_price',
  'description_category_id'
]);

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const deepClone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const NAME_ATTRIBUTE_ID = 4180;
const UNIT_QUANTITY_ATTRIBUTE_ID = 23249;
const DEFAULT_UNIT_QUANTITY_VALUE = '1';

const extractAttributeValue = (attribute) => {
  if (!attribute) return '';

  if (Array.isArray(attribute.values) && attribute.values.length > 0) {
    const first = attribute.values[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      if (hasValue(first.value)) return first.value;
      if (hasValue(first.text)) return first.text;
      if (hasValue(first.value_text)) return first.value_text;
    }
  }

  if (hasValue(attribute.value)) return attribute.value;
  if (hasValue(attribute.text_value)) return attribute.text_value;
  if (hasValue(attribute.value_text)) return attribute.value_text;

  if (Array.isArray(attribute.dictionary_values) && attribute.dictionary_values.length > 0) {
    const first = attribute.dictionary_values[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object') {
      if (hasValue(first.value)) return first.value;
      if (hasValue(first.text)) return first.text;
    }
  }

  return '';
};

const extractFirstAttributeValueEntry = (attribute) => {
  if (!attribute) return null;

  if (Array.isArray(attribute.values) && attribute.values.length > 0) {
    const first = attribute.values[0];
    if (typeof first === 'string') {
      return { value: first };
    }
    if (first && typeof first === 'object') {
      return first;
    }
  }

  if (hasValue(attribute.value)) {
    return { value: attribute.value };
  }
  if (hasValue(attribute.text_value)) {
    return { value: attribute.text_value };
  }
  if (hasValue(attribute.value_text)) {
    return { value: attribute.value_text };
  }

  if (Array.isArray(attribute.dictionary_values) && attribute.dictionary_values.length > 0) {
    const first = attribute.dictionary_values[0];
    if (typeof first === 'string') {
      return { value: first };
    }
    if (first && typeof first === 'object') {
      return first;
    }
  }

  return null;
};

const getAttributeDictionaryValueId = (attribute) => {
  const entry = extractFirstAttributeValueEntry(attribute);
  if (!entry) return null;

  const raw =
    entry?.dictionary_value_id ??
    entry?.dictionaryValueId ??
    entry?.value_id ??
    entry?.id;

  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  return String(raw);
};

const stringifyAttributeValues = (attribute) => {
  if (!attribute) return '';

  const rawValues = [];

  if (Array.isArray(attribute.values)) {
    rawValues.push(...attribute.values);
  } else if (Array.isArray(attribute.dictionary_values)) {
    rawValues.push(...attribute.dictionary_values);
  } else if (Array.isArray(attribute.dictionaryValues)) {
    rawValues.push(...attribute.dictionaryValues);
  } else if (hasValue(attribute.value)) {
    rawValues.push(attribute.value);
  } else if (hasValue(attribute.text_value)) {
    rawValues.push(attribute.text_value);
  } else if (hasValue(attribute.value_text)) {
    rawValues.push(attribute.value_text);
  } else if (typeof attribute === 'string') {
    rawValues.push(attribute);
  }

  return rawValues
    .map((valueEntry) => {
      if (typeof valueEntry === 'string') return valueEntry;
      if (!valueEntry || typeof valueEntry !== 'object') return '';

      if (hasValue(valueEntry.value)) return String(valueEntry.value);
      if (hasValue(valueEntry.text)) return String(valueEntry.text);
      if (hasValue(valueEntry.value_text)) return String(valueEntry.value_text);
      if (hasValue(valueEntry.name)) return String(valueEntry.name);

      return '';
    })
    .filter(Boolean)
    .join('\n');
};

const getProductAttributeValue = (product, attributeId) => {
  if (
    !product ||
    !Array.isArray(product.attributes) ||
    !attributeId
  ) {
    return '';
  }

  const attribute = product.attributes.find((attr) => {
    const attrId = Number(attr?.attribute_id ?? attr?.id ?? attr?.attributeId);
    return attrId === Number(attributeId);
  });

  return stringifyAttributeValues(attribute);
};
const parseAttributeTextareaValue = (rawValue = '', attributeId = null) => {
  if (!hasValue(rawValue)) return [];

  const normalizedValues = String(rawValue)
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (attributeId && String(attributeId) === TYPE_ATTRIBUTE_ID) {
    const firstValue = normalizedValues[0];
    return firstValue ? [{ value: firstValue }] : [];
  }

  return normalizedValues.map((value) => ({ value }));
};

const normalizeDictionaryValues = (metaSource = {}) => {
  const rawOptions =
    metaSource?.dictionary_values ||
    metaSource?.dictionaryValues ||
    metaSource?.dictionary ||
    [];

  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions
    .map((option) => {
      const optionId =
        option?.dictionary_value_id ??
        option?.value_id ??
        option?.id ??
        option?.value ??
        option?.text;
      if (optionId === undefined || optionId === null || optionId === '') {
        return null;
      }
      const label =
        option?.value ??
        option?.text ??
        option?.title ??
        option?.name ??
        String(optionId);
      return {
        id: String(optionId),
        label
      };
    })
    .filter(Boolean);
};

const pickFirstValue = (...candidates) => {
  for (const candidate of candidates) {
    if (hasValue(candidate)) {
      return String(candidate);
    }
  }
  return '';
};

const extractBaseFieldsFromTemplate = (template = {}) => {
  if (!template || typeof template !== 'object') {
    return {};
  }

  const result = {};

  result.category_id = pickFirstValue(template.category_id);
  result.description_category_id = pickFirstValue(template.description_category_id);
  result.price = pickFirstValue(template.price);
  result.old_price = pickFirstValue(template.old_price);
  result.min_price = pickFirstValue(template.min_price);

  result.depth = pickFirstValue(template.depth, template.length, template.package_depth, template.package_length);
  result.width = pickFirstValue(template.width, template.package_width);
  result.height = pickFirstValue(template.height, template.package_height);
  result.dimension_unit = pickFirstValue(template.dimension_unit);
  result.weight = pickFirstValue(template.weight, template.package_weight);
  result.weight_unit = pickFirstValue(template.weight_unit);

  return Object.entries(result).reduce((acc, [key, value]) => {
    if (hasValue(value)) {
      acc[key] = value;
    }
    return acc;
  }, {});
};

const attributeHasNonEmptyValues = (attribute) => {
  if (!attribute || !Array.isArray(attribute.values)) return false;
  return attribute.values.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    return (
      hasValue(entry.value) ||
      hasValue(entry.text) ||
      hasValue(entry.value_text) ||
      hasValue(entry.name)
    );
  });
};

const buildAttributesPayload = (
  templateAttributes = [],
  fieldMappings,
  rowValues,
  attributeOverrides = null
) => {
  const attributesMap = new Map();

  templateAttributes.forEach((attr) => {
    const attrId = Number(attr?.attribute_id ?? attr?.id ?? attr?.attributeId);
    if (!attrId) return;

    const clonedAttribute = deepClone(attr) || {};

    delete clonedAttribute.attribute_id;
    delete clonedAttribute.attributeId;
    delete clonedAttribute.attribute_value_id;
    delete clonedAttribute.attributeValueId;

    clonedAttribute.id = attrId;

    let values = [];

    if (Array.isArray(clonedAttribute.values)) {
      values = clonedAttribute.values
        .map((valueItem) => {
          if (typeof valueItem === 'string') {
            return { value: valueItem };
          }

          if (valueItem && typeof valueItem === 'object') {
            const valueClone = { ...valueItem };

            if (hasValue(valueClone.name) && !hasValue(valueClone.value)) {
              valueClone.value = valueClone.name;
            }

            if (hasValue(valueClone.value)) {
              valueClone.value = String(valueClone.value);
            }

            return valueClone;
          }

          return null;
        })
        .filter(Boolean);
    } else {
      const templateValue = extractAttributeValue(attr);
      if (hasValue(templateValue)) {
        values = [{ value: String(templateValue) }];
      }
    }

    clonedAttribute.values = values;

    attributesMap.set(attrId, clonedAttribute);
  });

  Object.entries(fieldMappings).forEach(([fieldKey, mapping]) => {
    if (!mapping?.enabled || !mapping.attributeId) return;

    const attrId = Number(mapping.attributeId);
    if (!attrId) return;

    const rawValue = rowValues?.[fieldKey];
    if (!hasValue(rawValue)) {
      return;
    }

    const overrideAttribute = attributesMap.get(attrId) || { id: attrId };
    overrideAttribute.values = [{ value: String(rawValue) }];
    delete overrideAttribute.dictionary_value_id;
    delete overrideAttribute.dictionary_values;
    delete overrideAttribute.value;
    delete overrideAttribute.text_value;

    attributesMap.set(attrId, overrideAttribute);
  });

  if (attributeOverrides && typeof attributeOverrides === 'object') {
    Object.entries(attributeOverrides).forEach(([attrIdKey, override]) => {
      const attrId = Number(attrIdKey);
      if (!attrId) return;

      const overrideAttribute = attributesMap.get(attrId) || { id: attrId };
      const valuesSource = Array.isArray(override?.values) ? override.values : null;

      if (valuesSource) {
        overrideAttribute.values = valuesSource
          .map((entry) => {
            if (typeof entry === 'string') {
              return { value: entry };
            }
            if (entry && typeof entry === 'object') {
              const entryClone = { ...entry };
              if (hasValue(entryClone.value)) {
                entryClone.value = String(entryClone.value);
              } else if (hasValue(entryClone.text)) {
                entryClone.value = String(entryClone.text);
                delete entryClone.text;
              }
              return entryClone;
            }
            return null;
          })
          .filter(Boolean);
      } else if (hasValue(override?.value)) {
        overrideAttribute.values = [{ value: String(override.value) }];
      }

      attributesMap.set(attrId, overrideAttribute);
    });
  }

  if (rowValues && hasValue(rowValues.name)) {
    const nameOverride = attributesMap.get(NAME_ATTRIBUTE_ID) || { id: NAME_ATTRIBUTE_ID };
    nameOverride.values = [{ value: String(rowValues.name) }];
    delete nameOverride.dictionary_value_id;
    delete nameOverride.dictionary_values;
    delete nameOverride.value;
    delete nameOverride.text_value;
    attributesMap.set(NAME_ATTRIBUTE_ID, nameOverride);
  }

  const unitQuantityAttribute = attributesMap.get(UNIT_QUANTITY_ATTRIBUTE_ID) || {
    id: UNIT_QUANTITY_ATTRIBUTE_ID
  };
  if (!attributeHasNonEmptyValues(unitQuantityAttribute)) {
    unitQuantityAttribute.values = [{ value: DEFAULT_UNIT_QUANTITY_VALUE }];
    attributesMap.set(UNIT_QUANTITY_ATTRIBUTE_ID, unitQuantityAttribute);
  }

  return Array.from(attributesMap.values()).filter(
    (attr) =>
      (Array.isArray(attr.values) && attr.values.length > 0) ||
      hasValue(attr.dictionary_value_id) ||
      (Array.isArray(attr.dictionary_values) && attr.dictionary_values.length > 0)
  );
};

const ensureTypeAttributeValid = (attributes = [], rowIndex = -1) => {
  const typeAttribute = attributes.find(
    (attr) => Number(attr?.id ?? attr?.attribute_id ?? 0) === TYPE_ATTRIBUTE_NUMERIC
  );
  if (!typeAttribute) {
    throw new Error(
      `Строка ${rowIndex + 1}: заполните обязательный атрибут "Тип товара" (ID ${TYPE_ATTRIBUTE_NUMERIC}).`
    );
  }

  const values = Array.isArray(typeAttribute.values) ? typeAttribute.values : [];
  const meaningfulValues = values.filter((entry) => {
    if (!entry) return false;
    return (
      hasValue(entry.value) ||
      hasValue(entry.text) ||
      hasValue(entry.value_text) ||
      hasValue(entry.dictionary_value_id)
    );
  });

  if (meaningfulValues.length === 0) {
    throw new Error(
      `Строка ${rowIndex + 1}: атрибут "Тип товара" (ID ${TYPE_ATTRIBUTE_NUMERIC}) должен содержать значение.`
    );
  }

  if (meaningfulValues.length > 1) {
    throw new Error(
      `Строка ${rowIndex + 1}: атрибут "Тип товара" (ID ${TYPE_ATTRIBUTE_NUMERIC}) может содержать только одно значение.`
    );
  }
};

const prepareTemplateBaseData = (template = {}, baseProductData = {}) => {
  const base = {};

  TEMPLATE_ALLOWED_FIELDS.forEach((key) => {
    if (hasValue(template[key]) || Array.isArray(template[key])) {
      base[key] = deepClone(template[key]);
    }
  });

  if (hasValue(baseProductData.category_id)) {
    base.category_id = String(baseProductData.category_id);
  } else if (hasValue(base.category_id)) {
    base.category_id = String(base.category_id);
  }

  if (hasValue(baseProductData.description_category_id)) {
    base.description_category_id = String(baseProductData.description_category_id);
  } else if (hasValue(base.description_category_id)) {
    base.description_category_id = String(base.description_category_id);
  }

  if (hasValue(baseProductData.price)) {
    base.price = String(baseProductData.price);
  } else if (hasValue(base.price)) {
    base.price = String(base.price);
  }

  if (hasValue(baseProductData.old_price)) {
    base.old_price = String(baseProductData.old_price);
  } else if (hasValue(base.old_price)) {
    base.old_price = String(base.old_price);
  }

  if (hasValue(baseProductData.vat)) {
    base.vat = String(baseProductData.vat);
  } else if (hasValue(base.vat)) {
    base.vat = String(base.vat);
  }

  if (!hasValue(base.currency_code)) {
    base.currency_code = hasValue(baseProductData.currency_code) ? baseProductData.currency_code : 'RUB';
  }

  if (!Array.isArray(base.attributes)) {
    base.attributes = Array.isArray(template.attributes) ? deepClone(template.attributes) : [];
  }

  return base;
};

const cleanObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) {
      return acc;
    }

    if (Array.isArray(value)) {
      const cleanedArray = value
        .map((item) => (typeof item === 'object' ? cleanObject(item) : item))
        .filter((item) => {
          if (item === undefined || item === null) return false;
          if (typeof item === 'object') return Object.keys(item).length > 0;
          if (typeof item === 'string') return item.trim().length > 0;
          return true;
        });

      if (cleanedArray.length > 0) {
        acc[key] = cleanedArray;
      }

      return acc;
    }

    if (typeof value === 'object') {
      const cleanedValue = cleanObject(value);
      if (Object.keys(cleanedValue).length > 0) {
        acc[key] = cleanedValue;
      }
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
};

const buildImportItemFromRow = ({
  template,
  baseProductData,
  rowValues,
  fieldMappings,
  rowIndex,
  attributeOverrides
}) => {
  const item = prepareTemplateBaseData(template, baseProductData);

  const offerId = rowValues?.offer_id ?? rowValues?.offerId;
  const name = rowValues?.name ?? template?.name;
  const descriptionSource = rowValues?.description ?? template?.description;
  const description =
    typeof descriptionSource === 'string' ? descriptionSource.trim() : descriptionSource;

  if (hasValue(offerId)) {
    item.offer_id = String(offerId);
  }

  if (hasValue(name)) {
    item.name = String(name);
  }

  if (hasValue(description)) {
    const normalizedDescription = String(description)
      .replace(/\s*\r?\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    item.description = normalizedDescription;
  }

  REQUIRED_BASE_FIELDS.forEach((field) => {
    if (hasValue(rowValues?.[field])) {
      item[field] = String(rowValues[field]);
    } else if (hasValue(baseProductData?.[field])) {
      item[field] = String(baseProductData[field]);
    }
  });

  item.attributes = buildAttributesPayload(
    template?.attributes || [],
    fieldMappings,
    rowValues,
    attributeOverrides
  );
  ensureTypeAttributeValid(item.attributes, rowIndex);

  const requiredFields = [];
  if (!hasValue(item.offer_id)) {
    requiredFields.push('offer_id');
  }
  if (!hasValue(item.name)) {
    requiredFields.push('name');
  }
  if (!hasValue(item.description)) {
    requiredFields.push('description');
  }

  if (requiredFields.length > 0) {
    throw new Error(`Строка ${rowIndex + 1}: отсутствуют значения ${requiredFields.join(', ')}`);
  }

  const missingBaseFields = REQUIRED_BASE_FIELDS.filter((field) => {
    const value = item[field];
    if (!hasValue(value)) return true;
    if (NUMERIC_BASE_FIELDS.includes(field)) {
      const numeric = Number(value);
      return !Number.isFinite(numeric) || numeric <= 0;
    }
    return false;
  });

  if (missingBaseFields.length > 0) {
    const readable = missingBaseFields.map((field) => BASE_FIELD_LABELS[field] || field);
    throw new Error(
      `Строка ${rowIndex + 1}: заполните обязательные поля ${readable.join(', ')}`
    );
  }

  ['price', 'old_price', 'premium_price', 'min_price'].forEach((field) => {
    if (hasValue(item[field])) {
      item[field] = String(item[field]);
    }
  });

  if (hasValue(item.vat)) {
    item.vat = String(item.vat);
  }

  return cleanObject(item);
};

const chunkArray = (items, chunkSize) => {
  const result = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    result.push(items.slice(index, index + chunkSize));
  }
  return result;
};

const sectionStyle = {
  backgroundColor: '#f9fafb',
  padding: '16px 20px',
  borderRadius: '12px',
  marginBottom: '18px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
};

export default function ImportExcelPage() {
  const [excelData, setExcelData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [saveMessage, setSaveMessage] = useState('');
  const [descriptionMessage, setDescriptionMessage] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [descriptionLoading, setDescriptionLoading] = useState(false);
  const [sampleOfferId, setSampleOfferId] = useState('');
  const [sampleTemplate, setSampleTemplate] = useState(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const fileInputRef = useRef(null);

  const [currentProfile, setCurrentProfile] = useState(null);

  // Используем хук для шаблонов
  const {
    fieldMappings,
    templatesLoading,
    templatesError,
    hasUnsavedChanges,
    userValues,
    updateFieldTemplate,
    toggleField,
    updateUserValue,
    saveTemplates,
    exportTemplates,
    resetToDefault,
    loadTemplatesFromFile,
    reloadTemplates
  } = useFieldTemplates();

  // Базовые данные товара
const [baseProductData, setBaseProductData] = useState({
  category_id: '',
  description_category_id: '',
  price: '',
  old_price: '',
  min_price: '',
    depth: '',
    width: '',
    height: '',
    dimension_unit: '',
    weight: '',
    weight_unit: '',
    vat: '0'
  });

  // Редактируемые данные для каждой строки
  const [rowData, setRowData] = useState({});
  const [rowAttributeOverrides, setRowAttributeOverrides] = useState({});
  const [rowSubmitLoading, setRowSubmitLoading] = useState(false);
  const [attributeModalState, setAttributeModalState] = useState({
    isOpen: false,
    rowIndex: null,
    attributes: [],
    metaValues: {}
  });
  const [pendingTemplateRefresh, setPendingTemplateRefresh] = useState(false);
  const templateFieldKeys = Object.keys(fieldMappings);
  const editableTemplateKeys = templateFieldKeys.filter(
    (key) => !HIDDEN_TEMPLATE_FIELDS.includes(key)
  );

  const attributeFieldMap = useMemo(() => {
    const map = new Map();
    Object.entries(fieldMappings).forEach(([fieldKey, mapping]) => {
      if (mapping?.attributeId) {
        map.set(Number(mapping.attributeId), fieldKey);
      }
    });
    return map;
  }, [fieldMappings]);

  const {
    loadAttributes: loadSampleAttributes
  } = useProductAttributes(apiClient, currentProfile);

  const {
    warehouses,
    loading: warehousesLoading,
    error: warehouseError,
    selectedWarehouse,
    refreshWarehouses,
    selectWarehouse
  } = useWarehouses(currentProfile);

  useEffect(() => {
    if (descriptionMessage) {
      const timer = setTimeout(() => setDescriptionMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [descriptionMessage]);

  useEffect(() => {
    if (descriptionError) {
      const timer = setTimeout(() => setDescriptionError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [descriptionError]);

  useEffect(() => {
    if (sampleError) {
      const timer = setTimeout(() => setSampleError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [sampleError]);

  // Загружаем текущий профиль при монтировании
  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
    console.log('Текущий профиль:', profile);
  }, []);

  // Показываем сообщение о сохранении
  useEffect(() => {
    if (saveMessage) {
      const timer = setTimeout(() => setSaveMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveMessage]);

  // Обработка загрузки файла
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const service = new OzonApiService('dummy', 'dummy');
      const data = await service.parseExcelFile(file);

      // Добавляем переводы для car_brand и все необходимые поля
      const dataWithTranslations = await Promise.all(
        data.map(async (row) => {
          const ru_car_brand = await translationService.findBrand(row.carBrand);

          // Создаем полный объект со всеми полями
          return {
            // Оригинальные поля из Excel
            colourCode: row.colourCode,
            colourName: row.colourName,
            carBrand: row.carBrand,

            // Поля в формате snake_case для шаблонов
            colour_code: row.colourCode,
            colour_name: row.colourName,
            car_brand: row.carBrand,

            // Добавленные поля
            ru_car_brand: ru_car_brand || row.carBrand,
            brand_code: userValues.brand_code || '',
            ru_color_name: userValues.ru_color_name || '',
            ozon_color_name: userValues.ozon_color_name || ''
          };
        })
      );

      setExcelData(dataWithTranslations);

      // Инициализируем данные для редактирования
      const initialRowData = {};
      dataWithTranslations.forEach((row, index) => {
        initialRowData[index] = {};
        Object.keys(fieldMappings).forEach(fieldKey => {
          initialRowData[index][fieldKey] = service.generateFieldValue(
            fieldKey,
            baseProductData,
            row,
            fieldMappings
          );
        });
      });
      setRowData(initialRowData);
      setRowAttributeOverrides({});
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      alert('Ошибка при чтении файла: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Обновление данных строки
  const updateRowField = (rowIndex, fieldKey, value) => {
    setRowData(prev => ({
      ...prev,
      [rowIndex]: {
        ...prev[rowIndex],
        [fieldKey]: value
      }
    }));
  };

  const getRowValuesForIndex = (rowIndex) => {
    const sourceRow = excelData[rowIndex] || {};
    const generatedRow = rowData[rowIndex] || {};

    const mergedValues = {
      ...sourceRow,
      ...generatedRow
    };

    if (!hasValue(mergedValues.brand_code)) {
      mergedValues.brand_code = userValues.brand_code || sourceRow.brand_code || '';
    }

    if (!hasValue(mergedValues.ru_color_name)) {
      mergedValues.ru_color_name = userValues.ru_color_name || sourceRow.ru_color_name || '';
    }

    if (!hasValue(mergedValues.ozon_color_name)) {
      mergedValues.ozon_color_name =
        userValues.ozon_color_name || sourceRow.ozon_color_name || '';
    }

    if (!hasValue(mergedValues.ru_car_brand)) {
      mergedValues.ru_car_brand = sourceRow.ru_car_brand || sourceRow.carBrand || '';
    }

    return mergedValues;
  };

  const openAttributesModal = (rowIndex) => {
    if (!sampleTemplate || !Array.isArray(sampleTemplate.attributes) || sampleTemplate.attributes.length === 0) {
      alert('Сначала загрузите образец с атрибутами.');
      return;
    }

    if (!rowData[rowIndex]) {
      alert('Примените шаблоны для выбранной строки перед редактированием атрибутов.');
      return;
    }

    const rowValues = getRowValuesForIndex(rowIndex);
    const overridesForRow = rowAttributeOverrides[rowIndex] || {};
    console.log('[ImportExcel] openAttributesModal row snapshot', {
      rowIndex,
      rowValues,
      overridesForRow,
      sampleAttrCount: sampleTemplate?.attributes?.length,
      availableAttrCount: sampleTemplate?.available_attributes?.length
    });
    const sampleAttributeValueMap = new Map();
    (sampleTemplate?.attributes || []).forEach((attr) => {
      const attrId = Number(attr?.attribute_id ?? attr?.id ?? attr?.attributeId);
      if (!attrId) return;
      sampleAttributeValueMap.set(attrId, attr);
    });

    const availableMetaMap = new Map();
    (sampleTemplate?.available_attributes || []).forEach((meta) => {
      const attrId = Number(meta?.attribute_id ?? meta?.id);
      if (!attrId) return;
      availableMetaMap.set(attrId, meta);
    });

    const seenAttrIds = new Set();

    const buildAttributeEntry = (metaSource, attrId, order) => {
      const fieldKey = attributeFieldMap.get(attrId);
      const mapping = fieldKey ? fieldMappings[fieldKey] : null;
      const sampleAttribute = sampleAttributeValueMap.get(attrId);
      const overrideAttribute = overridesForRow[attrId];
      const sampleValue = sampleAttributeValueMap.has(attrId)
        ? stringifyAttributeValues(sampleAttribute)
        : '';
      const overrideValue = overridesForRow[attrId]
        ? stringifyAttributeValues(overridesForRow[attrId])
        : '';
      const dictionaryValues = normalizeDictionaryValues(metaSource);
      const sampleDictionaryId = getAttributeDictionaryValueId(sampleAttribute);
      const overrideDictionaryId = getAttributeDictionaryValueId(overrideAttribute);
      const rowTypeValue = hasValue(rowValues.type_id) ? String(rowValues.type_id) : '';
      const templateTypeValue = hasValue(sampleTemplate?.type_id)
        ? String(sampleTemplate.type_id)
        : '';
      let selectedDictionaryId = overrideDictionaryId || sampleDictionaryId || '';

      let currentValue = '';
      if (fieldKey && hasValue(rowValues[fieldKey])) {
        currentValue = String(rowValues[fieldKey]);
      } else if (attrId === NAME_ATTRIBUTE_ID && hasValue(rowValues.name)) {
        currentValue = String(rowValues.name);
      } else if (hasValue(overrideValue)) {
        currentValue = overrideValue;
      } else if (hasValue(sampleValue)) {
        currentValue = sampleValue;
      } else {
        currentValue = stringifyAttributeValues(metaSource);
      }

      if (attrId === TYPE_ATTRIBUTE_NUMERIC) {
        if (hasValue(rowTypeValue)) {
          selectedDictionaryId = rowTypeValue;
        } else if (!hasValue(selectedDictionaryId) && hasValue(templateTypeValue)) {
          selectedDictionaryId = templateTypeValue;
        }

        if (hasValue(selectedDictionaryId)) {
          currentValue = selectedDictionaryId;
        }
      }

      return {
        id: attrId,
        name:
          (mapping && mapping.name) ||
          metaSource?.attribute_name ||
          metaSource?.name ||
          `Атрибут ${attrId}`,
        fieldKey,
        value: currentValue,
        required: Boolean(
          mapping?.required ??
            metaSource?.is_required ??
            metaSource?.isRequired ??
            metaSource?.required
        ),
        order,
        dictionaryValues,
        selectedDictionaryId
      };
    };

    const modalAttributes = [];

    (sampleTemplate?.attributes || []).forEach((attribute) => {
      const attrId = Number(attribute?.attribute_id ?? attribute?.id ?? attribute?.attributeId);
      if (!attrId || seenAttrIds.has(attrId)) return;
      seenAttrIds.add(attrId);
      const metaSource = availableMetaMap.get(attrId) || attribute;
      modalAttributes.push(buildAttributeEntry(metaSource, attrId, modalAttributes.length));
    });

    availableMetaMap.forEach((meta, attrId) => {
      if (seenAttrIds.has(attrId)) return;
      seenAttrIds.add(attrId);
      modalAttributes.push(buildAttributeEntry(meta, attrId, modalAttributes.length));
    });

    modalAttributes.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    console.log('[ImportExcel] openAttributesModal attributes final', modalAttributes);

    const metaValues = {};
    REQUIRED_BASE_FIELDS.forEach((field) => {
      if (hasValue(rowValues[field])) {
        metaValues[field] = String(rowValues[field]);
      } else if (hasValue(baseProductData[field])) {
        metaValues[field] = String(baseProductData[field]);
      } else {
        metaValues[field] = '';
      }
    });
    console.log('[ImportExcel] openAttributesModal meta values', metaValues);

    setAttributeModalState({
      isOpen: true,
      rowIndex,
      attributes: modalAttributes,
      metaValues
    });
  };

  const closeAttributesModal = () => {
    setAttributeModalState({
      isOpen: false,
      rowIndex: null,
      attributes: [],
      metaValues: {}
    });
  };

  const handleAttributeModalValueChange = (attrId, value, extra = {}) => {
    setAttributeModalState(prevState => {
      if (!prevState.isOpen) return prevState;

      return {
        ...prevState,
        attributes: prevState.attributes.map(attr => {
          if (attr.id !== attrId) {
            return attr;
          }
          const extraFields =
            String(attrId) === TYPE_ATTRIBUTE_ID && extra.selectedDictionaryId === undefined
              ? { ...extra, selectedDictionaryId: '' }
              : extra;
          return {
            ...attr,
            value,
            ...extraFields
          };
        })
      };
    });
  };

  const handleAttributeMetaValueChange = (field, value) => {
    setAttributeModalState(prevState => {
      if (!prevState.isOpen) return prevState;
      return {
        ...prevState,
        metaValues: {
          ...(prevState.metaValues || {}),
          [field]: value
        }
      };
    });
  };

  const handleAttributeModalSave = () => {
    if (!attributeModalState.isOpen) return;

    const { rowIndex, attributes, metaValues } = attributeModalState;

    setRowData(prev => {
      const currentRowValues = prev[rowIndex] || {};
      let didChange = false;

      const updatedRowValues = { ...currentRowValues };
      attributes.forEach(attr => {
        if (!attr.fieldKey) return;
        didChange = true;
        updatedRowValues[attr.fieldKey] = attr.value || '';
      });

      if (metaValues) {
        REQUIRED_BASE_FIELDS.forEach(field => {
          if (hasValue(metaValues[field])) {
            if (updatedRowValues[field] !== metaValues[field]) {
              didChange = true;
            }
            updatedRowValues[field] = metaValues[field];
          } else if (field in updatedRowValues) {
            didChange = true;
            delete updatedRowValues[field];
          }
        });
      }

      if (!didChange) {
        return prev;
      }

      return {
        ...prev,
        [rowIndex]: updatedRowValues
      };
    });

    setRowAttributeOverrides(prev => {
      const currentOverrides = { ...(prev[rowIndex] || {}) };

      attributes.forEach(attr => {
        if (attr.fieldKey) {
          // У таких атрибутов значение берется напрямую из строки
          delete currentOverrides[attr.id];
          return;
        }

        if (String(attr.id) === TYPE_ATTRIBUTE_ID && !hasValue(attr.selectedDictionaryId) && !hasValue(attr.value)) {
          delete currentOverrides[attr.id];
          return;
        }

        if (hasValue(attr.selectedDictionaryId)) {
          const optionLabel =
            (Array.isArray(attr.dictionaryValues)
              ? attr.dictionaryValues.find((option) => option.id === attr.selectedDictionaryId)?.label
              : null) || attr.value || attr.selectedDictionaryId;
          currentOverrides[attr.id] = {
            id: attr.id,
            values: [
              {
                value: optionLabel,
                dictionary_value_id: Number(attr.selectedDictionaryId)
              }
            ]
          };
          return;
        }

        const parsedValues = parseAttributeTextareaValue(attr.value, attr.id);
        if (parsedValues.length > 0) {
          currentOverrides[attr.id] = { id: attr.id, values: parsedValues };
        } else {
          delete currentOverrides[attr.id];
        }
      });

      const nextOverrides = { ...prev };
      if (Object.keys(currentOverrides).length > 0) {
        nextOverrides[rowIndex] = currentOverrides;
      } else {
        delete nextOverrides[rowIndex];
      }

      return nextOverrides;
    });
  };

  const handleAttributeModalSubmit = async () => {
    if (!attributeModalState.isOpen) {
      return;
    }

    const rowIndex = attributeModalState.rowIndex;
    if (rowIndex === null || rowIndex === undefined) {
      alert('Не удалось определить выбранную строку.');
      return;
    }

    if (!currentProfile) {
      alert('Профиль OZON не выбран. Пожалуйста, выберите профиль на главной странице.');
      return;
    }

    if (!sampleTemplate) {
      alert('Сначала выберите товар-образец.');
      return;
    }

    const row = excelData[rowIndex];
    const generatedRow = rowData[rowIndex];

    if (!row || !generatedRow) {
      alert('Сначала примените шаблоны для этой строки.');
      return;
    }

    setRowSubmitLoading(true);
    const requestStartedAt = Date.now();
    let taskId = null;
    try {
      const ruCarBrand = await translationService.findBrand(row.carBrand);

      const rowValues = {
        ...row,
        ru_car_brand: ruCarBrand || row.ru_car_brand || row.carBrand,
        brand_code: userValues.brand_code || row.brand_code || '',
        ru_color_name: userValues.ru_color_name || row.ru_color_name || '',
        ozon_color_name: userValues.ozon_color_name || row.ozon_color_name || '',
        ...generatedRow
      };

      if (attributeModalState.metaValues) {
        Object.entries(attributeModalState.metaValues).forEach(([field, value]) => {
          if (hasValue(value)) {
            rowValues[field] = value;
          }
        });
      }

      const descriptionValue =
        typeof rowValues.description === 'string' ? rowValues.description.trim() : '';

      if (!descriptionValue) {
        alert('Заполните поле "Описание" перед отправкой в OZON.');
        return;
      }

    const normalizedDescription = descriptionValue
      .replace(/\s*\r?\n\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    rowValues.description = normalizedDescription;

      const item = buildImportItemFromRow({
        template: sampleTemplate,
        baseProductData,
        rowValues,
        fieldMappings,
        rowIndex,
        attributeOverrides: rowAttributeOverrides[rowIndex]
      });
      const mandatorySnapshot = REQUIRED_BASE_FIELDS.reduce((acc, field) => {
        acc[field] = item[field] ?? '';
        return acc;
      }, {});
      console.log('[ImportExcel] handleAttributeModalSubmit item', {
        rowIndex,
        offer_id: item.offer_id,
        mandatorySnapshot
      });

      const service = new OzonApiService(
        currentProfile.ozon_api_key,
        currentProfile.ozon_client_id
      );
      console.log('[ImportExcel] Sending single item to OZON', item);
      const response = await service.createProductsBatch([item]);
      console.log('[ImportExcel] createProductsBatch response', response);
      taskId = response?.result?.task_id;
      if (taskId) {
        try {
          console.log('[ImportExcel] Waiting before status check', {
            taskId,
            delay: STATUS_CHECK_DELAY_MS
          });
          await wait(STATUS_CHECK_DELAY_MS);
          console.log('[ImportExcel] Checking task status', taskId);
          const statusResponse = await service.getProductImportStatus(taskId);
          const summary = buildImportStatusSummary(statusResponse);
          logImportStatusSummary(summary);
          const message =
            summary?.primaryMessage?.message ||
            `Товар ${item.offer_id} отправлен в OZON. Задача ${taskId}.`;
          const durationMs = Date.now() - requestStartedAt;
          await appendImportLog({
            offerId: item.offer_id,
            status: 200,
            durationMs,
            errorMessage: null,
            taskId,
            userName: currentProfile?.name || currentProfile?.user_id
          });
          alert(message);
        } catch (statusError) {
          console.error('[ImportExcel] Failed to check task status', statusError);
          const durationMs = Date.now() - requestStartedAt;
          await appendImportLog({
            offerId: item.offer_id,
            status: null,
            durationMs,
            errorMessage: statusError.message,
            taskId,
            userName: currentProfile?.name || currentProfile?.user_id
          });
          alert(
            `Товар ${item.offer_id} отправлен в OZON, но не удалось проверить статус: ${statusError.message}`
          );
        }
      } else {
        console.log('[ImportExcel] Task ID not returned, skipping status check');
        const durationMs = Date.now() - requestStartedAt;
        await appendImportLog({
          offerId: item.offer_id,
          status: 200,
          durationMs,
          errorMessage: null,
          taskId: null,
          userName: currentProfile?.name || currentProfile?.user_id
        });
        alert(`Товар ${item.offer_id} отправлен в OZON.`);
      }
    } catch (error) {
      console.error('[ImportExcel] Send row to OZON error:', error);
      const durationMs = Date.now() - requestStartedAt;
      await appendImportLog({
        offerId: row?.offer_id || row?.offerId || '',
        status: null,
        durationMs,
        errorMessage: error.message,
        taskId: null,
        userName: currentProfile?.name || currentProfile?.user_id
      });
      alert('Ошибка отправки в OZON: ' + (error.message || 'Неизвестная ошибка'));
    } finally {
      setRowSubmitLoading(false);
    }
  };

  // Применение шаблонов ко всем строкам
  const applyTemplatesToAll = async () => {
    const service = new OzonApiService('dummy', 'dummy');
    const newRowData = { ...rowData };

    for (let index = 0; index < excelData.length; index++) {
      const originalRow = excelData[index];

      // Обновляем перевод для каждой строки
      const ru_car_brand = await translationService.findBrand(originalRow.carBrand);
      const updatedRow = {
        ...originalRow,
        ru_car_brand: ru_car_brand || originalRow.carBrand,
        brand_code: userValues.brand_code || '',
        ru_color_name: userValues.ru_color_name || '',
        ozon_color_name: userValues.ozon_color_name || ''
      };

      newRowData[index] = { ...(newRowData[index] || {}) };

      Object.keys(fieldMappings).forEach(fieldKey => {
        const mapping = fieldMappings[fieldKey];
        if (!mapping) {
          return;
        }
        if (fieldKey === 'description' && (!mapping.template || mapping.template.trim() === '')) {
          return;
        }

        newRowData[index][fieldKey] = service.generateFieldValue(
          fieldKey,
          baseProductData,
          updatedRow,
          fieldMappings
        );
      });
    }

    setRowData(newRowData);
  };

  useEffect(() => {
    if (!pendingTemplateRefresh) {
      return;
    }
    const refresh = async () => {
      try {
        await applyTemplatesToAll();
      } catch (error) {
        console.error('Auto template refresh failed', error);
      } finally {
        setPendingTemplateRefresh(false);
      }
    };
    refresh();
  }, [pendingTemplateRefresh]);

  const handleSampleOfferIdChange = (event) => {
    setSampleOfferId(event.target.value);
  };

  const loadSampleProduct = async () => {
    const trimmedOffer = sampleOfferId.trim();

    if (!trimmedOffer) {
      alert('Введите артикул товара для загрузки образца.');
      return;
    }

    if (!currentProfile) {
      alert('Профиль OZON не выбран. Выберите профиль на главной странице.');
      return;
    }

    try {
      setSampleLoading(true);
      setSampleError('');

      console.log('[ImportExcel] loadSampleProduct start', trimmedOffer);
      const loadResult = await loadSampleAttributes(trimmedOffer);
      const editableProducts = Array.isArray(loadResult?.editable) ? loadResult.editable : [];
      const rawProducts = Array.isArray(loadResult?.raw) ? loadResult.raw : [];
      console.log('[ImportExcel] attributes load result', {
        editableCount: editableProducts.length,
        rawCount: rawProducts.length
      });
      console.log('[ImportExcel] normalized attributes snapshot', editableProducts);
      console.log('[ImportExcel] raw attributes snapshot', rawProducts);
      const productInfo = rawProducts[0] || editableProducts[0];

      if (!productInfo) {
        console.warn('[ImportExcel] productInfo empty');
        throw new Error('Ответ OZON пуст. Проверьте правильность артикула.');
      }

      const templatePrefills = [
        { fieldKey: 'hashtags', attributeId: 23171 },
        { fieldKey: 'rich_content_json', attributeId: 11254 },
        { fieldKey: 'description', attributeId: 4191 }
      ];
      let didPrefillTemplates = false;
      templatePrefills.forEach(({ fieldKey, attributeId }) => {
        const mapping = fieldMappings[fieldKey];
        if (!mapping || (mapping.template && mapping.template.trim())) {
          return;
        }
        const sampleValue = getProductAttributeValue(productInfo, attributeId);
        if (hasValue(sampleValue)) {
          updateFieldTemplate(fieldKey, sampleValue);
          didPrefillTemplates = true;
        }
      });
      if (didPrefillTemplates) {
        setPendingTemplateRefresh(true);
      }

      setSampleTemplate(deepClone(productInfo));
      console.log('[ImportExcel] sampleTemplate set', productInfo);
      setRowAttributeOverrides({});
      setSampleOfferId(trimmedOffer);

      const templateBaseFields = extractBaseFieldsFromTemplate(productInfo);
      console.log('[ImportExcel] template base fields', templateBaseFields);
      if (Object.keys(templateBaseFields).length > 0) {
        setBaseProductData(prev => ({
          ...prev,
          ...templateBaseFields
        }));
      }

      try {
        const params = new URLSearchParams({
          offer_id: trimmedOffer,
          profile: encodeURIComponent(JSON.stringify(currentProfile))
        });
        const infoResponse = await fetch(`/api/products/info-list?${params.toString()}`);
        console.log('[ImportExcel] info-list status', infoResponse.status);
        if (infoResponse.ok) {
          const infoData = await infoResponse.json();
          console.log('[ImportExcel] info-list raw', infoData);
          const item = Array.isArray(infoData?.items) && infoData.items.length
            ? infoData.items[0]
            : Array.isArray(infoData?.raw?.items) && infoData.raw.items.length
              ? infoData.raw.items[0]
              : null;
          if (item) {
            const extracted = extractBaseFieldsFromProductInfo(item);
            console.log('[ImportExcel] info-list extracted', extracted);
            if (Object.keys(extracted).length > 0) {
              setBaseProductData(prev => ({
                ...prev,
                ...extracted
              }));
            }
          }
        }
      } catch (infoError) {
        console.error('[ImportExcel] Не удалось получить информацию о товаре', infoError);
      }
    } catch (error) {
      console.error('[ImportExcel] Ошибка загрузки образца:', error);
      setSampleTemplate(null);
      setSampleError(error.message || 'Ошибка загрузки образца');
    } finally {
      console.log('[ImportExcel] loadSampleProduct finished');
      setSampleLoading(false);
    }
  };

  const resetSampleTemplate = () => {
    setSampleTemplate(null);
    setSampleOfferId('');
    setSampleError('');
    setRowAttributeOverrides({});
  };

  const generateSeoDescriptions = async () => {
    if (!fieldMappings.description || !fieldMappings.description.enabled) {
      alert('Поле SEO названий отключено. Включите его в настройках шаблонов.');
      return;
    }

    if (!userValues.seo_keywords || !userValues.seo_keywords.trim()) {
      alert('Введите ключевые слова для SEO названий.');
      return;
    }

    if (excelData.length === 0) {
      alert('Загрузите Excel файл, чтобы сгенерировать SEO названия.');
      return;
    }

    try {
      setDescriptionLoading(true);
      setDescriptionError('');
      setDescriptionMessage('');

      const response = await fetch('/api/ai/generate-seo-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords: userValues.seo_keywords,
          rows: excelData.map((row, index) => ({
            index,
            colourCode: row.colourCode,
            colourName: row.colourName,
            carBrand: row.carBrand,
            ruCarBrand: row.ru_car_brand,
            templateValues: rowData[index] || {}
          })),
          baseProductData
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedMessage = '';
        try {
          const parsed = JSON.parse(errorText);
          parsedMessage =
            parsed?.error?.message ||
            parsed?.message ||
            (typeof parsed === 'string' ? parsed : '');
        } catch (parseError) {
          // no-op, fallback to raw text
        }

        let message = parsedMessage || errorText || 'Не удалось сгенерировать SEO названия';
        if (response.status === 429 || /quota/i.test(message)) {
          message =
            'Превышена квота OpenAI. Проверьте тариф или лимиты и повторите попытку позже.';
        }

        throw new Error(message);
      }

      const result = await response.json();

      if (!result.descriptions || !Array.isArray(result.descriptions)) {
        throw new Error('Некорректный формат ответа от сервиса генерации');
      }

      setRowData(prev => {
        const updated = { ...prev };
        result.descriptions.forEach(item => {
          if (typeof item?.index === 'number' && item.index in updated) {
            updated[item.index] = {
              ...updated[item.index],
              description: item.description || ''
            };
          }
        });
        return updated;
      });

      const filledCount = result.descriptions.filter(item => item?.description).length;
      setDescriptionMessage(`Сгенерировано SEO названий: ${filledCount}`);
    } catch (error) {
      console.error('Ошибка генерации SEO названий:', error);
      setDescriptionError(error.message || 'Ошибка генерации SEO названий');
    } finally {
      setDescriptionLoading(false);
    }
  };

  // Сохранение шаблонов
  const handleSaveTemplates = () => {
    const success = saveTemplates();
    if (success) {
      setSaveMessage('✅ Шаблоны успешно сохранены!');
    } else {
      setSaveMessage('❌ Ошибка сохранения шаблонов');
    }
  };

  // Обновление пользовательских значений
  const handleUserValueChange = (key, value) => {
    updateUserValue(key, value);
    // Применяем шаблоны ко всем строкам при изменении brand_code или ru_color_name
    if (
      excelData.length > 0 &&
      (key === 'brand_code' || key === 'ru_color_name' || key === 'ozon_color_name')
    ) {
      setTimeout(() => applyTemplatesToAll(), 100);
    }
  };

const handleBaseFieldChange = (field, value) => {
  setBaseProductData(prev => ({
    ...prev,
    [field]: value
  }));
};

const extractBaseFieldsFromProductInfo = (info = {}) => {
  if (!info || typeof info !== 'object') {
    return {};
  }

  const result = {};

  ['price', 'old_price', 'min_price'].forEach((field) => {
    if (hasValue(info[field])) {
      result[field] = String(info[field]);
    }
  });

  const packageDimensions = info.package_dimensions || info.dimensions || {};
  const packageWeight = info.package_weight;
  const packageWeightUnit = info.package_weight_unit;

  if (hasValue(info.depth) || hasValue(info.length) || hasValue(packageDimensions.length) || hasValue(packageDimensions.depth)) {
    result.depth = pickFirstValue(info.depth, info.length, packageDimensions.length, packageDimensions.depth);
  }
  if (hasValue(info.width) || hasValue(packageDimensions.width)) {
    result.width = pickFirstValue(info.width, packageDimensions.width);
  }
  if (hasValue(info.height) || hasValue(packageDimensions.height)) {
    result.height = pickFirstValue(info.height, packageDimensions.height);
  }
  if (hasValue(info.dimension_unit) || hasValue(packageDimensions.dimension_unit)) {
    result.dimension_unit = pickFirstValue(info.dimension_unit, packageDimensions.dimension_unit);
  }
  if (hasValue(info.weight) || hasValue(packageWeight)) {
    result.weight = pickFirstValue(info.weight, packageWeight);
  }
  if (hasValue(info.weight_unit) || hasValue(packageWeightUnit)) {
    result.weight_unit = pickFirstValue(info.weight_unit, packageWeightUnit);
  }

  if (hasValue(info?.category_id)) {
    result.category_id = String(info.category_id);
  }

  if (hasValue(info?.description_category_id)) {
    result.description_category_id = String(info.description_category_id);
  }

  return result;
};

  // Импорт товаров в OZON
  const importToOzon = async () => {
    if (!currentProfile) {
      alert('Профиль OZON не выбран. Пожалуйста, выберите профиль на главной странице.');
      return;
    }

    if (!sampleTemplate) {
      alert('Сначала выберите образец товара по артикулу.');
      return;
    }

    if (excelData.length === 0) {
      alert('Загрузите Excel файл, чтобы импортировать товары.');
      return;
    }

    setLoading(true);
    setImportProgress({ current: 0, total: excelData.length });

    try {
      const service = new OzonApiService(
        currentProfile.ozon_api_key,
        currentProfile.ozon_client_id
      );

      const preparedItems = [];
      const skippedRows = [];

      for (let index = 0; index < excelData.length; index++) {
        const row = excelData[index];
        const generatedRow = rowData[index];

        if (!generatedRow) {
          throw new Error(`Строка ${index + 1}: не удалось сформировать данные. Примените шаблоны заново.`);
        }

        const ruCarBrand = await translationService.findBrand(row.carBrand);

        const rowValues = {
          ...row,
          ru_car_brand: ruCarBrand || row.ru_car_brand || row.carBrand,
          brand_code: userValues.brand_code || row.brand_code || '',
          ru_color_name: userValues.ru_color_name || row.ru_color_name || '',
          ozon_color_name: userValues.ozon_color_name || row.ozon_color_name || '',
          ...generatedRow
        };

        const descriptionValue =
          typeof rowValues.description === 'string' ? rowValues.description.trim() : '';

        if (!descriptionValue) {
          skippedRows.push(index + 1);
          continue;
        }

        const normalizedDescription = descriptionValue
          .replace(/\s*\r?\n\s*/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
        rowValues.description = normalizedDescription;

        preparedItems.push(
          buildImportItemFromRow({
            template: sampleTemplate,
            baseProductData,
            rowValues,
            fieldMappings,
            rowIndex: index,
            attributeOverrides: rowAttributeOverrides[index]
          })
        );
      }

      if (preparedItems.length === 0) {
        alert('Нет строк с заполненным полем "Описание". Дополните данные и повторите импорт.');
        return;
      }

      const batches = chunkArray(preparedItems, 100);
      let processed = 0;

      for (const batch of batches) {
        await service.createProductsBatch(batch);
        processed += batch.length;
        setImportProgress({ current: processed, total: preparedItems.length });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const successMessageParts = [`Успешно импортировано ${preparedItems.length} товаров!`];
      if (skippedRows.length > 0) {
        successMessageParts.push(
          `Пропущено строк без описания: ${skippedRows.length} (№ ${skippedRows.join(', ')})`
        );
      }

      alert(successMessageParts.join('\n'));
    } catch (error) {
      console.error('Import error:', error);
      alert('Ошибка импорта: ' + (error.message || 'Неизвестная ошибка'));
    } finally {
      setLoading(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  // Отладочная информация
  console.log('Состояние компонента:', {
    templatesLoading,
    templatesError,
    fieldMappingsCount: Object.keys(fieldMappings).length,
    excelDataCount: excelData.length,
    hasUnsavedChanges,
    userValues
  });

  return (
    <Fragment>
      {/* Заголовок и навигация */}
      <div style={{ marginBottom: '12px' }}>
        <a href="/" style={{ color: '#0070f3', textDecoration: 'none', fontSize: '14px' }}>← На главную</a>
        <a href="/products" style={{ color: '#0070f3', textDecoration: 'none', marginLeft: '15px', fontSize: '14px' }}>📦 Товары</a>
      </div>

      {/* Компактное отображение профиля */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0 }}>Импорт товаров из Excel</h1>

        {currentProfile ? (
          <div style={{
            fontSize: '14px',
            color: '#666',
            textAlign: 'right'
          }}>
            <div style={{ fontWeight: 'bold', color: '#28a745' }}>
              ✅ {currentProfile.name}
            </div>
            <div style={{ fontSize: '12px' }}>
              Client ID: {currentProfile.ozon_client_id?.slice(0, 8)}...
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: '14px',
            color: '#dc3545',
            textAlign: 'right'
          }}>
            <div>⚠️ Профиль не выбран</div>
            <a href="/" style={{ fontSize: '12px', color: '#0070f3' }}>
              Выбрать на главной
            </a>
          </div>
        )}
      </div>

      {currentProfile && (
        <div
          style={{
            marginBottom: '20px',
            padding: '15px',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            backgroundColor: '#fff'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Текущий склад</div>
          {warehousesLoading ? (
            <div style={{ fontSize: 13, color: '#6c757d' }}>Загрузка списка складов...</div>
          ) : warehouses.length ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedWarehouse?.warehouse_id || ''}
                onChange={(e) => selectWarehouse(e.target.value)}
                style={{
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ced4da',
                  minWidth: '280px'
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
                  borderRadius: '4px',
                  border: '1px solid #0070f3',
                  backgroundColor: 'transparent',
                  color: '#0070f3',
                  cursor: 'pointer'
                }}
              >
                Обновить
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#6c757d' }}>Список складов пуст. Попробуйте обновить.</div>
          )}
          {selectedWarehouse && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#6c757d' }}>
              Выбран: {selectedWarehouse.name} ({selectedWarehouse.status_label || selectedWarehouse.status || '—'})
            </div>
          )}
          {warehouseError && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#dc3545' }}>{warehouseError}</div>
          )}
        </div>
      )}

      {/* Индикатор загрузки шаблонов */}
      {templatesLoading && (
        <div style={{
          backgroundColor: '#e7f3ff',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <p>Загрузка шаблонов...</p>
          <div style={{ marginTop: '10px' }}>
            <small>Проверяем наличие файла шаблонов...</small>
          </div>
        </div>
      )}

      {/* Ошибка загрузки шаблонов */}
      {templatesError && (
        <div style={{
          backgroundColor: '#ffe7e7',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          <p style={{ color: '#dc3545', margin: 0, fontWeight: 'bold' }}>
            Ошибка загрузки шаблонов
          </p>
          <p style={{ color: '#dc3545', margin: '5px 0', fontSize: '14px' }}>
            {templatesError}
          </p>
          <p style={{ fontSize: '12px', color: '#666', margin: '5px 0' }}>
            Используются встроенные шаблоны. Для исправления создайте файл:
            public/field-templates/ozon-templates.json
          </p>
          <button
            onClick={loadTemplatesFromFile}
            style={{
              marginTop: '10px',
              padding: '5px 10px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Повторить загрузку
          </button>
        </div>
      )}

      {/* Сообщение о сохранении */}
      {saveMessage && (
        <div style={{
          backgroundColor: saveMessage.includes('✅') ? '#d4edda' : '#f8d7da',
          color: saveMessage.includes('✅') ? '#155724' : '#721c24',
          padding: '10px 15px',
          borderRadius: '4px',
          marginBottom: '20px',
          border: `1px solid ${saveMessage.includes('✅') ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {saveMessage}
        </div>
      )}

      {/* Загрузка файла - показываем всегда */}
      <div style={{ ...sectionStyle }}>
        <h2>1. Загрузка Excel файла</h2>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          ref={fileInputRef}
          style={{ marginBottom: '10px' }}
        />
        <p style={{ color: '#666', fontSize: '14px' }}>
          Файл должен содержать колонки: Colour Code, Colour Name, Car Brand
        </p>
      </div>

      {/* Пользовательские значения - показываем когда шаблоны загружены */}
      {!templatesLoading && Object.keys(fieldMappings).length > 0 && (
        <div style={{ ...sectionStyle }}>
          <h2>2. Пользовательские значения</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '15px',
            marginBottom: '15px'
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Код бренда (brand_code):
              </label>
              <input
                type="text"
                value={userValues.brand_code || ''}
                onChange={(e) => handleUserValueChange('brand_code', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
                placeholder="Например: MOTIP"
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                Используется в шаблонах как {'{brand_code}'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Русское название цвета (ru_color_name):
              </label>
              <input
                type="text"
                value={userValues.ru_color_name || ''}
                onChange={(e) => handleUserValueChange('ru_color_name', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
                placeholder="Например: Красный металлик"
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                Используется в шаблонах как {'{ru_color_name}'}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Цвет OZON (ozon_color_name):
              </label>
              <input
                type="text"
                value={userValues.ozon_color_name || ''}
                onChange={(e) => handleUserValueChange('ozon_color_name', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
                placeholder="Например: Черный перламутр"
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                Используется в шаблонах как {'{ozon_color_name}'}
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Ключевые слова для SEO названий:
              </label>
              <textarea
                value={userValues.seo_keywords || ''}
                onChange={(e) => handleUserValueChange('seo_keywords', e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
                placeholder="Например: автомобильная эмаль, ремонт сколов, краска для автомобиля"
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                Эти ключевые слова будут переданы в ChatGPT для генерации SEO названий.
              </div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#666', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
            <strong>Доступные переменные в шаблонах:</strong><br />
            • {'{colour_code}'} - код цвета<br />
            • {'{colour_name}'} - название цвета<br />
            • {'{car_brand}'} - марка автомобиля<br />
            • {'{ru_car_brand}'} - русское название марки автомобиля<br />
            • {'{brand_code}'} - код бренда (задается выше)<br />
            • {'{ru_color_name}'} - русское название цвета (задается выше)<br />
            • {'{ozon_color_name}'} - значение поля «Цвет OZON» (задается выше)<br />
            • Поле SEO названий генерируется автоматически на основе ключевых слов
          </div>
        </div>
      )}

      {/* Образец товара */}
      {!templatesLoading && (
        <div style={{ ...sectionStyle }}>
          <h2>3. Образец товара по артикулу</h2>
          <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '14px' }}>
            Выберите существующий товар на OZON, чтобы использовать его как шаблон. Его изображения и постоянные
            атрибуты будут скопированы, а значения из таблицы подставятся автоматически.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <input
              type="text"
              value={sampleOfferId}
              onChange={handleSampleOfferIdChange}
              placeholder="Введите артикул (offer_id)"
              style={{
                flex: '1 1 240px',
                minWidth: '200px',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            />
            <button
              onClick={loadSampleProduct}
              disabled={sampleLoading || !currentProfile}
              style={{
                padding: '8px 16px',
                backgroundColor: sampleLoading ? '#6c757d' : '#0070f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: sampleLoading || !currentProfile ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
              title={!currentProfile ? 'Выберите профиль на главной странице' : ''}
            >
              {sampleLoading ? 'Загрузка...' : 'Выбрать образец'}
            </button>
            {sampleTemplate && (
              <button
                onClick={resetSampleTemplate}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ffc107',
                  color: '#212529',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Очистить
              </button>
            )}
          </div>
          {sampleError && (
            <div style={{
              backgroundColor: '#ffe7e7',
              borderRadius: '4px',
              padding: '10px 12px',
              color: '#dc3545',
              fontSize: '13px',
              marginBottom: '10px'
            }}>
              {sampleError}
            </div>
          )}
          {sampleTemplate && (
            <div style={{
              backgroundColor: '#e9ecef',
              borderRadius: '4px',
              padding: '12px',
              fontSize: '13px',
              color: '#444'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
                Выбран образец: {sampleTemplate.name || sampleTemplate.offer_id || sampleOfferId}
              </div>
              <div>Атрибутов: {sampleTemplate?.attributes?.length || 0}</div>
              {sampleTemplate?.description && (
                <div style={{ marginTop: '6px', color: '#666' }}>
                  <span style={{ fontWeight: 'bold' }}>Описание образца:</span>{' '}
                  {sampleTemplate.description.slice(0, 200)}
                  {sampleTemplate.description.length > 200 ? '…' : ''}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Настройки шаблонов - показываем когда шаблоны загружены */}
      {!templatesLoading && Object.keys(fieldMappings).length > 0 && (
        <div style={{ ...sectionStyle }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>4. Настройка шаблонов полей</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {hasUnsavedChanges && (
                <span style={{
                  fontSize: '12px',
                  color: '#856404',
                  backgroundColor: '#fff3cd',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid #ffeaa7'
                }}>
                  Есть несохраненные изменения
                </span>
              )}
              <button
                onClick={handleSaveTemplates}
                disabled={!hasUnsavedChanges}
                style={{
                  padding: '6px 12px',
                  backgroundColor: hasUnsavedChanges ? '#28a745' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: hasUnsavedChanges ? 'pointer' : 'not-allowed',
                  fontSize: '12px'
                }}
              >
                💾 Сохранить
              </button>
              <button
                onClick={exportTemplates}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                📤 Экспорт
              </button>
              <button
                onClick={resetToDefault}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#ffc107',
                  color: '#212529',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                🔄 Сброс
              </button>
              <button
                onClick={loadTemplatesFromFile}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                📥 Загрузить
              </button>
              <span style={{ fontSize: '12px', color: '#28a745' }}>
                ✅ {editableTemplateKeys.length} полей
              </span>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '15px',
            marginBottom: '15px'
          }}>
            {editableTemplateKeys.map(fieldKey => (
              <div key={fieldKey} style={{
                padding: '15px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: fieldMappings[fieldKey].enabled ? 'white' : '#f8f9fa'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'bold', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={fieldMappings[fieldKey].enabled}
                      onChange={() => toggleField(fieldKey)}
                      style={{ marginRight: '8px' }}
                    />
                    {fieldMappings[fieldKey].name}
                    {fieldMappings[fieldKey].required && <span style={{ color: 'red', marginLeft: '5px' }}>*</span>}
                  </label>
                  {fieldMappings[fieldKey].attributeId && (
                    <span style={{
                      fontSize: '12px',
                      color: '#666',
                      backgroundColor: '#e9ecef',
                      padding: '2px 6px',
                      borderRadius: '3px'
                    }}>
                      ID: {fieldMappings[fieldKey].attributeId}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={fieldMappings[fieldKey].template}
                  onChange={(e) => updateFieldTemplate(fieldKey, e.target.value)}
                  disabled={!fieldMappings[fieldKey].enabled}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    backgroundColor: fieldMappings[fieldKey].enabled ? 'white' : '#f8f9fa'
                  }}
                  placeholder="Шаблон"
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  {fieldMappings[fieldKey].template}
                </div>
              </div>
            ))}
          </div>

          {excelData.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
              <button
                onClick={applyTemplatesToAll}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Применить шаблоны ко всем строкам
              </button>
              {fieldMappings.description && (
                <button
                  onClick={generateSeoDescriptions}
                  disabled={
                    descriptionLoading ||
                    !fieldMappings.description.enabled ||
                    !(userValues.seo_keywords && userValues.seo_keywords.trim())
                  }
                  style={{
                    padding: '10px 20px',
                    backgroundColor: descriptionLoading ? '#6c757d' : '#845ef7',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor:
                      descriptionLoading ||
                      !fieldMappings.description.enabled ||
                      !(userValues.seo_keywords && userValues.seo_keywords.trim())
                        ? 'not-allowed'
                        : 'pointer'
                  }}
                  title={
                    !(userValues.seo_keywords && userValues.seo_keywords.trim())
                      ? 'Введите ключевые слова для SEO названий в разделе выше'
                      : ''
                  }
                >
                  {descriptionLoading ? 'Генерация SEO названий...' : '✨ Сгенерировать SEO названия'}
                </button>
              )}
              {descriptionMessage && (
                <span style={{ fontSize: '12px', color: '#28a745' }}>
                  {descriptionMessage}
                </span>
              )}
              {descriptionError && (
                <span style={{ fontSize: '12px', color: '#dc3545' }}>
                  {descriptionError}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Остальные секции показываем только когда есть данные Excel */}
      {excelData.length > 0 && (
        <div>
          {/* Базовые настройки товара */}
          <div style={{ ...sectionStyle }}>
            <h2>5. Базовые настройки товара</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>ID категории:</label>
              <input
                type="text"
                value={baseProductData.category_id}
                onChange={(e) => handleBaseFieldChange('category_id', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>ID категории описания:</label>
              <input
                type="text"
                value={baseProductData.description_category_id}
                onChange={(e) => handleBaseFieldChange('description_category_id', e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                placeholder="description_category_id"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Цена:</label>
              <input
                type="text"
                value={baseProductData.price}
                  onChange={(e) => handleBaseFieldChange('price', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Старая цена:</label>
                <input
                  type="text"
                  value={baseProductData.old_price}
                  onChange={(e) => handleBaseFieldChange('old_price', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Минимальная цена:</label>
                <input
                  type="text"
                  value={baseProductData.min_price}
                  onChange={(e) => handleBaseFieldChange('min_price', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
            </div>

            <div style={{
              marginTop: '15px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '15px'
            }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Глубина (depth):</label>
                <input
                  type="text"
                  value={baseProductData.depth}
                  onChange={(e) => handleBaseFieldChange('depth', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Ширина (width):</label>
                <input
                  type="text"
                  value={baseProductData.width}
                  onChange={(e) => handleBaseFieldChange('width', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Высота (height):</label>
                <input
                  type="text"
                  value={baseProductData.height}
                  onChange={(e) => handleBaseFieldChange('height', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Единица габаритов:</label>
                <input
                  type="text"
                  value={baseProductData.dimension_unit}
                  onChange={(e) => handleBaseFieldChange('dimension_unit', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  placeholder="например: mm"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Вес:</label>
                <input
                  type="text"
                  value={baseProductData.weight}
                  onChange={(e) => handleBaseFieldChange('weight', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Единица веса:</label>
                <input
                  type="text"
                  value={baseProductData.weight_unit}
                  onChange={(e) => handleBaseFieldChange('weight_unit', e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                  placeholder="например: kg"
                />
              </div>
            </div>
          </div>

          {/* Предпросмотр данных */}
          <div style={{ ...sectionStyle, padding: '16px 20px 24px' }}>
            <h2 style={{ marginBottom: '12px' }}>6. Предпросмотр данных ({excelData.length} строк)</h2>

            {/* Прогресс импорта */}
            {importProgress.total > 0 && (
              <div style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#e9f7ef',
                border: '1px solid #c3e6cb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span>Импорт товаров</span>
                  <span>{importProgress.current} / {importProgress.total}</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#dfe7eb', borderRadius: '999px', height: '8px' }}>
                  <div
                    style={{
                      width: `${(importProgress.current / importProgress.total) * 100}%`,
                      backgroundColor: '#28a745',
                      height: '100%',
                      borderRadius: '999px',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{
              backgroundColor: 'white',
              borderRadius: '14px',
              border: '1px solid #d7dde5',
              overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(15, 23, 42, 0.08)'
            }}>
              <div style={{
                maxHeight: '65vh',
                overflowX: 'auto',
                overflowY: 'auto'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  backgroundColor: 'white',
                  fontSize: '13px',
                  tableLayout: 'fixed'
                }}>
                <thead style={{
                  position: 'sticky',
                  top: 0,
                  backgroundColor: '#f8f9fa',
                  zIndex: 10
                }}>
                  <tr>
                    <th style={{
                      padding: '10px 8px',
                      border: '1px solid #dee2e6',
                      textAlign: 'left',
                      fontSize: '12px',
                      width: '48px'
                    }}>#</th>
                    <th style={{
                      padding: '10px 8px',
                      border: '1px solid #dee2e6',
                      textAlign: 'left',
                      fontSize: '12px',
                      width: '110px'
                    }}>Атрибуты</th>
                    <th style={{
                      padding: '10px 8px',
                      border: '1px solid #dee2e6',
                      textAlign: 'left',
                      fontSize: '12px',
                      minWidth: '110px'
                    }}>Colour Code</th>
                    <th style={{
                      padding: '10px 8px',
                      border: '1px solid #dee2e6',
                      textAlign: 'left',
                      fontSize: '12px',
                      minWidth: '140px'
                    }}>Colour Name</th>
                    <th style={{
                      padding: '10px 8px',
                      border: '1px solid #dee2e6',
                      textAlign: 'left',
                      fontSize: '12px',
                      minWidth: '140px'
                    }}>Car Brand</th>
                    <th style={{
                      padding: '10px 8px',
                      border: '1px solid #dee2e6',
                      textAlign: 'left',
                      fontSize: '12px',
                      minWidth: '140px'
                    }}>Ru Car Brand</th>
                    {Object.keys(fieldMappings).map(fieldKey => (
                      <th key={fieldKey} style={{
                        padding: '10px 8px',
                        border: '1px solid #dee2e6',
                        textAlign: 'left',
                        fontSize: '12px',
                        minWidth: getFieldWidth(fieldKey) || '150px'
                      }}>
                        {fieldMappings[fieldKey].name}
                        {!fieldMappings[fieldKey].enabled && (
                          <span style={{ color: '#dc3545', fontSize: '10px', marginLeft: '3px' }}>(откл)</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelData.map((row, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '12px',
                        textAlign: 'center'
                      }}>{index + 1}</td>
                      <td style={{
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        textAlign: 'center'
                      }}>
                        <button
                          onClick={() => openAttributesModal(index)}
                          disabled={!sampleTemplate || !rowData[index]}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: !sampleTemplate || !rowData[index] ? '#adb5bd' : '#0d6efd',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: !sampleTemplate || !rowData[index] ? 'not-allowed' : 'pointer',
                            fontSize: '11px',
                            width: '100%'
                          }}
                          title={
                            !sampleTemplate
                              ? 'Сначала выберите товар-образец'
                              : !rowData[index]
                                ? 'Примените шаблоны к этой строке'
                                : 'Открыть редактор атрибутов'
                          }
                        >
                          Атрибуты
                        </button>
                      </td>
                      <td style={{
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '12px'
                      }}>{row.colourCode}</td>
                      <td style={{
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '12px'
                      }}>{row.colourName}</td>
                      <td style={{
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '12px'
                      }}>{row.carBrand}</td>
                      <td style={{
                        padding: '8px',
                        border: '1px solid #dee2e6',
                        fontSize: '12px'
                      }}>{row.ru_car_brand}</td>
                      {Object.keys(fieldMappings).map(fieldKey => (
                        <td key={fieldKey} style={{
                          padding: '8px',
                          border: '1px solid #dee2e6',
                          backgroundColor: !fieldMappings[fieldKey].enabled ? '#f8f9fa' : 'white',
                          minWidth: getFieldWidth(fieldKey) || '150px',
                          verticalAlign: 'top'
                        }}>
                          <textarea
                            value={rowData[index]?.[fieldKey] || ''}
                            onChange={(e) => updateRowField(index, fieldKey, e.target.value)}
                            disabled={!fieldMappings[fieldKey].enabled}
                            style={{
                              width: '100%',
                              padding: '6px',
                              border: '1px solid #d0d5dd',
                              borderRadius: '6px',
                              fontSize: '12px',
                              backgroundColor: !fieldMappings[fieldKey].enabled ? '#f8f9fa' : 'white',
                              resize: 'vertical',
                              minHeight: fieldKey === 'name'
                                ? '80px'
                                : fieldKey === 'description'
                                  ? '120px'
                                  : '60px',
                              maxHeight: '220px',
                              fontFamily: 'inherit',
                              lineHeight: '1.45'
                            }}
                            rows={fieldKey === 'name' ? 4 : fieldKey === 'description' ? 6 : 3}
                            placeholder={fieldMappings[fieldKey].enabled ? 'Введите значение...' : 'Поле отключено'}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>

          <AttributesModal
            source="import"
            isOpen={attributeModalState.isOpen}
            importState={attributeModalState}
            onImportValueChange={handleAttributeModalValueChange}
            onImportSave={handleAttributeModalSave}
            onImportClose={closeAttributesModal}
            onImportSubmit={handleAttributeModalSubmit}
            importSubmitLoading={rowSubmitLoading}
            importSubmitDisabled={
              rowSubmitLoading ||
              !currentProfile ||
              !sampleTemplate ||
              !attributeModalState.isOpen ||
              !rowData[attributeModalState.rowIndex ?? -1]
            }
            onImportMetaChange={handleAttributeMetaValueChange}
            importBaseValues={baseProductData}
            fieldMappings={fieldMappings}
            profile={currentProfile}
            offerId={sampleOfferId}
            priceContextLabel={sampleOfferId ? `Образец ${sampleOfferId}` : undefined}
          />

          {/* Кнопка импорта */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              onClick={importToOzon}
              disabled={loading || !currentProfile || templatesLoading || !sampleTemplate || sampleLoading}
              style={{
                padding: '15px 30px',
                backgroundColor: loading || !currentProfile || templatesLoading || !sampleTemplate || sampleLoading ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || !currentProfile || templatesLoading || !sampleTemplate || sampleLoading ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
              title={
                !currentProfile
                  ? 'Выберите профиль OZON на главной странице'
                  : templatesLoading
                    ? 'Ожидайте загрузку шаблонов'
                    : !sampleTemplate
                      ? 'Сначала выберите образец товара по артикулу'
                      : ''
              }
            >
              {loading ? 'Импорт...' : `Импортировать ${excelData.length} товаров в OZON`}
            </button>
            {!currentProfile && (
              <p style={{ color: '#dc3545', marginTop: '10px' }}>
                Для импорта необходимо выбрать профиль OZON
              </p>
            )}
            {templatesLoading && (
              <p style={{ color: '#dc3545', marginTop: '10px' }}>
                Ожидание загрузки шаблонов...
              </p>
            )}
          </div>
        </div>
      )}
    </Fragment>
  );
}

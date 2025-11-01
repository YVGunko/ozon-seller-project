import { useState, useRef, useEffect, Fragment } from 'react';
import { OzonApiService } from '../src/services/ozon-api';
import { ProfileManager } from '../src/utils/profileManager';
import translationService from '../src/services/TranslationService';

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
    "template": "{ru_color_name}",
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
  'min_price'
]);

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const deepClone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

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

const buildAttributesPayload = (templateAttributes = [], fieldMappings, rowValues) => {
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

  return Array.from(attributesMap.values()).filter(
    (attr) =>
      (Array.isArray(attr.values) && attr.values.length > 0) ||
      hasValue(attr.dictionary_value_id) ||
      (Array.isArray(attr.dictionary_values) && attr.dictionary_values.length > 0)
  );
};

const prepareTemplateBaseData = (template = {}, baseProductData = {}) => {
  const base = {};

  TEMPLATE_ALLOWED_FIELDS.forEach((key) => {
    if (hasValue(template[key]) || Array.isArray(template[key])) {
      base[key] = deepClone(template[key]);
    }
  });

  if (hasValue(baseProductData.category_id)) {
    base.category_id = baseProductData.category_id;
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
  rowIndex
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
    item.description = String(description);
  }

  item.attributes = buildAttributesPayload(template?.attributes || [], fieldMappings, rowValues);

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
    price: '',
    old_price: '',
    vat: '0'
  });

  // Редактируемые данные для каждой строки
  const [rowData, setRowData] = useState({});
  const templateFieldKeys = Object.keys(fieldMappings);
  const editableTemplateKeys = templateFieldKeys.filter(
    (key) => !HIDDEN_TEMPLATE_FIELDS.includes(key)
  );

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
            ru_color_name: userValues.ru_color_name || ''
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
        ru_color_name: userValues.ru_color_name || ''
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

      const params = new URLSearchParams({
        offer_id: trimmedOffer,
        profile: JSON.stringify(currentProfile)
      });

      const response = await fetch(`/api/products/attributes?${params.toString()}`);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Не удалось загрузить образец товара');
      }

      const result = await response.json();
      const productInfo = result?.result?.[0];

      if (!productInfo) {
        throw new Error('Ответ OZON пуст. Проверьте правильность артикула.');
      }

      setSampleTemplate(deepClone(productInfo));
      setSampleOfferId(trimmedOffer);
    } catch (error) {
      console.error('Ошибка загрузки образца:', error);
      setSampleTemplate(null);
      setSampleError(error.message || 'Ошибка загрузки образца');
    } finally {
      setSampleLoading(false);
    }
  };

  const resetSampleTemplate = () => {
    setSampleTemplate(null);
    setSampleOfferId('');
    setSampleError('');
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
    if (excelData.length > 0 && (key === 'brand_code' || key === 'ru_color_name')) {
      setTimeout(() => applyTemplatesToAll(), 100);
    }
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
          ...generatedRow
        };

        const descriptionValue =
          typeof rowValues.description === 'string' ? rowValues.description.trim() : '';

        if (!descriptionValue) {
          skippedRows.push(index + 1);
          continue;
        }

        rowValues.description = descriptionValue;

        preparedItems.push(
          buildImportItemFromRow({
            template: sampleTemplate,
            baseProductData,
            rowValues,
            fieldMappings,
            rowIndex: index
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
                  onChange={(e) => setBaseProductData(prev => ({ ...prev, category_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Цена:</label>
                <input
                  type="text"
                  value={baseProductData.price}
                  onChange={(e) => setBaseProductData(prev => ({ ...prev, price: e.target.value }))}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Старая цена:</label>
                <input
                  type="text"
                  value={baseProductData.old_price}
                  onChange={(e) => setBaseProductData(prev => ({ ...prev, old_price: e.target.value }))}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
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

import { useState, useRef, useEffect } from 'react';
import { OzonApiService } from '../src/services/ozon-api';
import { ProfileManager } from '../src/utils/profileManager';

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

  useEffect(() => {
    loadTemplates();
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
      const fallbackTemplates = {
        offer_id: {
          name: 'Артикул',
          template: 'MOTIP-{colour_code}-{row_index}',
          attributeId: null,
          enabled: true,
          required: true
        },
        name: {
          name: 'Название товара',
          template: 'Краска Motip {colour_name} {car_brand}',
          attributeId: null,
          enabled: true,
          required: true
        },
        brand: {
          name: 'Бренд',
          template: 'Motip',
          attributeId: 85,
          enabled: true,
          required: true
        },
        model_name: {
          name: 'Название модели',
          template: '{colour_name}',
          attributeId: 9048,
          enabled: true,
          required: false
        },
        color_code: {
          name: 'Цвет товара',
          template: '{colour_code}',
          attributeId: 10096,
          enabled: true,
          required: false
        },
        color_name: {
          name: 'Название цвета',
          template: '{colour_name}',
          attributeId: 10097,
          enabled: true,
          required: false
        },
        car_brand: {
          name: 'Марка ТС',
          template: '{car_brand}',
          attributeId: 7204,
          enabled: true,
          required: false
        },
        part_number: {
          name: 'Партномер',
          template: 'MOTIP-{colour_code}',
          attributeId: 7236,
          enabled: true,
          required: false
        },
        alternative_offers: {
          name: 'Альтернативные артикулы',
          template: '{colour_code}',
          attributeId: 11031,
          enabled: true,
          required: false
        }
      };
      setFieldMappings(fallbackTemplates);
    } finally {
      setTemplatesLoading(false);
      console.log('Загрузка шаблонов завершена, loading:', false);
    }
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
    updateFieldTemplate,
    toggleField,
    saveTemplates,
    exportTemplates,
    resetToDefault,
    reloadTemplates: loadTemplates
  };
};

export default function ImportExcelPage() {
  const [excelData, setExcelData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [saveMessage, setSaveMessage] = useState('');
  const fileInputRef = useRef(null);
  
  const [currentProfile, setCurrentProfile] = useState(null);

  // Используем хук для шаблонов
  const {
    fieldMappings,
    templatesLoading,
    templatesError,
    hasUnsavedChanges,
    updateFieldTemplate,
    toggleField,
    saveTemplates,
    exportTemplates,
    resetToDefault,
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
      setExcelData(data);
      
      // Инициализируем данные для редактирования
      const initialRowData = {};
      data.forEach((row, index) => {
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
  const applyTemplatesToAll = () => {
    const service = new OzonApiService('dummy', 'dummy');
    const newRowData = { ...rowData };
    
    excelData.forEach((row, index) => {
      Object.keys(fieldMappings).forEach(fieldKey => {
        newRowData[index][fieldKey] = service.generateFieldValue(
          fieldKey, 
          baseProductData, 
          row, 
          fieldMappings
        );
      });
    });
    
    setRowData(newRowData);
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

  // Импорт товаров в OZON
  const importToOzon = async () => {
    if (!currentProfile) {
      alert('Профиль OZON не выбран. Пожалуйста, выберите профиль на главной странице.');
      return;
    }

    setLoading(true);
    setImportProgress({ current: 0, total: excelData.length });

    try {
      const service = new OzonApiService(
        currentProfile.ozon_api_key,
        currentProfile.ozon_client_id
      );

      const products = excelData.map((row, index) => {
        return service.prepareProductFromTemplate(baseProductData, row, fieldMappings);
      });

      const batchSize = 10;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        await service.createProductsBatch(batch);
        setImportProgress({ current: i + batch.length, total: products.length });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      alert(`Успешно импортировано ${products.length} товаров!`);
    } catch (error) {
      console.error('Import error:', error);
      alert('Ошибка импорта: ' + error.message);
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
    hasUnsavedChanges
  });

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Заголовок и навигация */}
      <div style={{ marginBottom: '15px' }}>
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
            onClick={reloadTemplates}
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
      <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
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

      {/* Настройки шаблонов - показываем когда шаблоны загружены */}
      {!templatesLoading && Object.keys(fieldMappings).length > 0 && (
        <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>2. Настройка шаблонов полей</h2>
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
                onClick={reloadTemplates}
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
                ⟳ Обновить
              </button>
              <span style={{ fontSize: '12px', color: '#28a745' }}>
                ✅ {Object.keys(fieldMappings).length} полей
              </span>
            </div>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
            gap: '15px',
            marginBottom: '15px'
          }}>
            {Object.keys(fieldMappings).map(fieldKey => (
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
                  Доступные переменные: {'{colour_code}'}, {'{colour_name}'}, {'{car_brand}'}, {'{row_index}'}
                </div>
              </div>
            ))}
          </div>
          
          {excelData.length > 0 && (
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
          )}
        </div>
      )}

      {/* Остальные секции показываем только когда есть данные Excel */}
      {excelData.length > 0 && (
        <>
          {/* Базовые настройки товара */}
          <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <h2>3. Базовые настройки товара</h2>
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
          <div style={{ marginBottom: '20px' }}>
            <h2>4. Предпросмотр данных ({excelData.length} строк)</h2>
            
            {/* Прогресс импорта */}
            {importProgress.total > 0 && (
              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Импорт товаров:</span>
                  <span>{importProgress.current} / {importProgress.total}</span>
                </div>
                <div style={{ width: '100%', backgroundColor: '#dee2e6', borderRadius: '4px', height: '10px' }}>
                  <div 
                    style={{ 
                      width: `${(importProgress.current / importProgress.total) * 100}%`, 
                      backgroundColor: '#28a745',
                      height: '100%',
                      borderRadius: '4px',
                      transition: 'width 0.3s'
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                backgroundColor: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                fontSize: '14px'
              }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 10 }}>
                  <tr>
                    <th style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'left' }}>Colour Code</th>
                    <th style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'left' }}>Colour Name</th>
                    <th style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'left' }}>Car Brand</th>
                    {Object.keys(fieldMappings).map(fieldKey => (
                      <th key={fieldKey} style={{ padding: '12px', border: '1px solid #dee2e6', textAlign: 'left' }}>
                        {fieldMappings[fieldKey].name}
                        {!fieldMappings[fieldKey].enabled && (
                          <span style={{ color: '#dc3545', fontSize: '12px', marginLeft: '5px' }}>(откл)</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {excelData.map((row, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{index + 1}</td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{row.colourCode}</td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{row.colourName}</td>
                      <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{row.carBrand}</td>
                      {Object.keys(fieldMappings).map(fieldKey => (
                        <td key={fieldKey} style={{ 
                          padding: '8px', 
                          border: '1px solid #dee2e6',
                          backgroundColor: !fieldMappings[fieldKey].enabled ? '#f8f9fa' : 'white'
                        }}>
                          <input
                            type="text"
                            value={rowData[index]?.[fieldKey] || ''}
                            onChange={(e) => updateRowField(index, fieldKey, e.target.value)}
                            disabled={!fieldMappings[fieldKey].enabled}
                            style={{ 
                              width: '100%', 
                              padding: '4px', 
                              border: '1px solid #ddd', 
                              borderRadius: '2px',
                              fontSize: '12px',
                              backgroundColor: !fieldMappings[fieldKey].enabled ? '#f8f9fa' : 'white'
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Кнопка импорта */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              onClick={importToOzon}
              disabled={loading || !currentProfile || templatesLoading}
              style={{
                padding: '15px 30px',
                backgroundColor: loading || !currentProfile || templatesLoading ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || !currentProfile || templatesLoading ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
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
        </>
      )}
    </div>
  );
}
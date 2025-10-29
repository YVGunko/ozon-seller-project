import { useState, useRef } from 'react';
import { OzonApiService } from '../src/services/ozon-api';

export default function ImportExcelPage() {
  const [excelData, setExcelData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);

  // Настройки полей для OZON
  const [fieldMappings, setFieldMappings] = useState({
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
  });

  // Базовые данные товара
  const [baseProductData, setBaseProductData] = useState({
    category_id: '',
    price: '',
    old_price: '',
    vat: '0'
  });

  // Редактируемые данные для каждой строки
  const [rowData, setRowData] = useState({});

  // Обработка загрузки файла
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const service = new OzonApiService('dummy', 'dummy'); // Credentials не нужны для парсинга
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

  // Обновление шаблона поля
  const updateFieldTemplate = (fieldKey, template) => {
    setFieldMappings(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        template: template
      }
    }));
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

  // Импорт товаров в OZON
  const importToOzon = async () => {
    if (!process.env.OZON_API_KEY || !process.env.OZON_CLIENT_ID) {
      alert('Не настроены API ключи OZON');
      return;
    }

    setLoading(true);
    setImportProgress({ current: 0, total: excelData.length });

    try {
      const service = new OzonApiService(
        process.env.OZON_API_KEY,
        process.env.OZON_CLIENT_ID
      );

      const products = excelData.map((row, index) => {
        return service.prepareProductFromTemplate(baseProductData, row, fieldMappings);
      });

      // Отправляем товары батчами по 10 штук (ограничение OZON API)
      const batchSize = 10;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        await service.createProductsBatch(batch);
        setImportProgress({ current: i + batch.length, total: products.length });
        
        // Задержка между батчами чтобы не превысить лимиты API
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

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <a href="/" style={{ color: '#0070f3', textDecoration: 'none' }}>← На главную</a>
        <a href="/products" style={{ color: '#0070f3', textDecoration: 'none', marginLeft: '15px' }}>📦 Товары</a>
        <h1>Импорт товаров из Excel</h1>
      </div>

      {/* Загрузка файла */}
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

      {excelData.length > 0 && (
        <>
          {/* Настройки шаблонов */}
          <div style={{ backgroundColor: '#f5f5f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
            <h2>2. Настройка шаблонов полей</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
              {Object.keys(fieldMappings).map(fieldKey => (
                <div key={fieldKey} style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    {fieldMappings[fieldKey].name}:
                    {fieldMappings[fieldKey].required && <span style={{ color: 'red' }}> *</span>}
                  </label>
                  <input
                    type="text"
                    value={fieldMappings[fieldKey].template}
                    onChange={(e) => updateFieldTemplate(fieldKey, e.target.value)}
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      border: '1px solid #ddd', 
                      borderRadius: '4px' 
                    }}
                    placeholder="Шаблон"
                  />
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    Доступные переменные: {'{colour_code}'}, {'{colour_name}'}, {'{car_brand}'}, {'{row_index}'}
                  </div>
                </div>
              ))}
            </div>
            
            <button
              onClick={applyTemplatesToAll}
              style={{
                padding: '10px 20px',
                backgroundColor: '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '10px'
              }}
            >
              Применить шаблоны ко всем строкам
            </button>
          </div>

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
                        <td key={fieldKey} style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                          <input
                            type="text"
                            value={rowData[index]?.[fieldKey] || ''}
                            onChange={(e) => updateRowField(index, fieldKey, e.target.value)}
                            style={{ 
                              width: '100%', 
                              padding: '4px', 
                              border: '1px solid #ddd', 
                              borderRadius: '2px',
                              fontSize: '12px'
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
              disabled={loading}
              style={{
                padding: '15px 30px',
                backgroundColor: loading ? '#6c757d' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              {loading ? 'Импорт...' : `Импортировать ${excelData.length} товаров в OZON`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
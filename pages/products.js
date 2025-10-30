import { useState, useEffect } from 'react';
import { ProfileManager } from '../src/utils/profileManager';
import { apiClient } from '../src/services/api-client';

export default function ProductsPage() {
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

  // Состояние для атрибутов
  const [attributes, setAttributes] = useState(null);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Состояния для копирования товара
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

  // Загружаем текущий профиль при монтировании
  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  useEffect(() => {
    if (!currentProfile) return;

    const fetchProducts = async () => {
      try {
        setLoading(true);
        const productsData = await apiClient.getProducts(20, currentProfile);
        setProducts(productsData);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [currentProfile]);

  // Функция для получения атрибутов товара
  const fetchAttributes = async (offerId) => {
    setLoadingAttributes(true);
    setSelectedProduct(offerId);

    try {
      const response = await fetch('/api/products/attributes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offer_id: offerId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch attributes');
      }

      const data = await response.json();
      setAttributes(data);
    } catch (error) {
      console.error('Error fetching attributes:', error);
      setAttributes({ error: error.message });
    } finally {
      setLoadingAttributes(false);
    }
  };

  // Функция для закрытия модального окна
  const closeAttributes = () => {
    setAttributes(null);
    setSelectedProduct(null);
  };

  // Функция для открытия модального окна копирования
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

  // Функция для копирования товара
  const copyProduct = async () => {
    if (!copyForm.new_offer_id) {
      alert('Пожалуйста, введите новый артикул');
      return;
    }

    setCopyLoading(true);
    try {
      const modifications = {};

      // Собираем только измененные поля
      if (copyForm.name && copyForm.name !== selectedProduct.name) {
        modifications.name = copyForm.name;
      }
      if (copyForm.color) {
        modifications.color = copyForm.color;
      }
      if (copyForm.description) {
        modifications.description = copyForm.description;
      }
      if (copyForm.price) {
        modifications.price = copyForm.price;
      }
      if (copyForm.old_price) {
        modifications.old_price = copyForm.old_price;
      }

      const response = await fetch('/api/products/copy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_offer_id: selectedProduct.offer_id,
          new_offer_id: copyForm.new_offer_id,
          modifications: modifications
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || 'Failed to copy product');
      }

      const result = await response.json();
      console.log('Product copied successfully:', result);

      alert('Товар успешно скопирован!');
      setCopyModalOpen(false);

      // Обновляем список товаров
      fetchProducts(true);
    } catch (error) {
      console.error('Error copying product:', error);
      alert(`Ошибка при копировании: ${error.message}`);
    } finally {
      setCopyLoading(false);
    }
  };

  // Загрузка продуктов
  const fetchProducts = async (reset = false) => {
    if (loading) return;

    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        limit: pagination.limit.toString(),
        ...(reset ? {} : { last_id: pagination.last_id }),
        ...(filters.offer_id && { offer_id: filters.offer_id })
      }).toString();

      const activeProfile = ProfileManager.getCurrentProfile();
      if (!activeProfile) {
        console.warn('⚠️ No active profile selected');
        // Можно показать уведомление пользователю
        alert('Пожалуйста, выберите профиль в настройках');
        return;
      }
      
      const profileParam = activeProfile ? `&profile=${encodeURIComponent(JSON.stringify(activeProfile))}` : '';
      console.log(`✅ fetchProducts profileParam: ${profileParam}`);
      const response = await fetch(`/api/products?${queryParams}${profileParam}`);
      const data = await response.json();

      if (data.result) {
        setProducts(prev => reset ? data.result.items : [...prev, ...data.result.items]);
        setPagination(prev => ({
          ...prev,
          last_id: data.result.last_id || '',
          hasMore: !!data.result.last_id && data.result.items.length === prev.limit
        }));
      }
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Применение фильтров
  const applyFilters = () => {
    setProducts([]);
    setPagination(prev => ({ ...prev, last_id: '', hasMore: true }));
    fetchProducts(true);
  };

  // Сброс фильтров
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

  // Загрузка при монтировании
  useEffect(() => {
    fetchProducts(true);
  }, []);

  // Фильтрация продуктов на клиенте
  const filteredProducts = products.filter(product => {
    if (filters.archived !== 'all' && product.archived !== (filters.archived === 'true')) return false;
    if (filters.has_fbo_stocks !== 'all' && product.has_fbo_stocks !== (filters.has_fbo_stocks === 'true')) return false;
    if (filters.has_fbs_stocks !== 'all' && product.has_fbs_stocks !== (filters.has_fbs_stocks === 'true')) return false;
    if (filters.is_discounted !== 'all' && product.is_discounted !== (filters.is_discounted === 'true')) return false;
    return true;
  });

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Заголовок и навигация */}
      <div style={{ marginBottom: '15px' }}>
        <a href="/" style={{ color: '#0070f3', textDecoration: 'none', fontSize: '14px' }}>← На главную</a>
      </div>

      {/* Компактное отображение профиля */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0 }}>Управление товарами OZON</h1>

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

      {/* Фильтры */}
      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px'
      }}>
        {/* ... существующие фильтры без изменений ... */}
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

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            В архиве:
          </label>
          <select
            value={filters.archived}
            onChange={(e) => setFilters(prev => ({ ...prev, archived: e.target.value }))}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option value="all">Все</option>
            <option value="true">Да</option>
            <option value="false">Нет</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            FBO остатки:
          </label>
          <select
            value={filters.has_fbo_stocks}
            onChange={(e) => setFilters(prev => ({ ...prev, has_fbo_stocks: e.target.value }))}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option value="all">Все</option>
            <option value="true">Есть</option>
            <option value="false">Нет</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            FBS остатки:
          </label>
          <select
            value={filters.has_fbs_stocks}
            onChange={(e) => setFilters(prev => ({ ...prev, has_fbs_stocks: e.target.value }))}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option value="all">Все</option>
            <option value="true">Есть</option>
            <option value="false">Нет</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Уцененный:
          </label>
          <select
            value={filters.is_discounted}
            onChange={(e) => setFilters(prev => ({ ...prev, is_discounted: e.target.value }))}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option value="all">Все</option>
            <option value="true">Да</option>
            <option value="false">Нет</option>
          </select>
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

      {/* Статистика */}
      <div style={{ marginBottom: '20px', color: '#666' }}>
        Показано: {filteredProducts.length} товаров
        {products.length !== filteredProducts.length && ` (отфильтровано из ${products.length})`}
      </div>

      {/* Таблица товаров */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Product ID</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Артикул</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>В архиве</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>FBO остатки</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>FBS остатки</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Уцененный</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr key={product.product_id} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: '12px' }}>{product.product_id}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{product.offer_id}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    color: product.archived ? '#dc3545' : '#28a745',
                    fontWeight: 'bold'
                  }}>
                    {product.archived ? 'Да' : 'Нет'}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    color: product.has_fbo_stocks ? '#28a745' : '#6c757d'
                  }}>
                    {product.has_fbo_stocks ? 'Есть' : 'Нет'}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    color: product.has_fbs_stocks ? '#28a745' : '#6c757d'
                  }}>
                    {product.has_fbs_stocks ? 'Есть' : 'Нет'}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    color: product.is_discounted ? '#ffc107' : '#6c757d'
                  }}>
                    {product.is_discounted ? 'Да' : 'Нет'}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => fetchAttributes(product.offer_id)}
                      disabled={loadingAttributes && selectedProduct === product.offer_id}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loadingAttributes && selectedProduct === product.offer_id ? 'not-allowed' : 'pointer',
                        fontSize: '12px'
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
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
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
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#6c757d',
            backgroundColor: 'white'
          }}>
            Товары не найдены
          </div>
        )}
      </div>

      {/* Кнопка загрузки еще */}
      {pagination.hasMore && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={() => fetchProducts(false)}
            disabled={loading}
            style={{
              padding: '12px 30px',
              backgroundColor: loading ? '#6c757d' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            {loading ? 'Загрузка...' : 'Загрузить еще'}
          </button>
        </div>
      )}

      {!pagination.hasMore && products.length > 0 && (
        <div style={{
          textAlign: 'center',
          marginTop: '20px',
          color: '#6c757d',
          padding: '10px'
        }}>
          Все товары загружены
        </div>
      )}

      {/* Модальные окна (остаются без изменений) */}
      {/* Модальное окно с атрибутами */}
      {attributes && (
        <div style={{
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
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '800px',
            maxHeight: '80vh',
            overflow: 'auto',
            width: '100%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2>Атрибуты товара: {selectedProduct}</h2>
              <button
                onClick={closeAttributes}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Закрыть
              </button>
            </div>

            {attributes.error ? (
              <div style={{ color: '#dc3545', padding: '20px', textAlign: 'center' }}>
                Ошибка: {attributes.error}
              </div>
            ) : attributes.result && attributes.result.length > 0 ? (
              <div>
                {attributes.result.map((productInfo, index) => (
                  <div key={index}>
                    {/* Основная информация о товаре */}
                    <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                      <h3>Основная информация</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div><strong>ID:</strong> {productInfo.id}</div>
                        <div><strong>Артикул:</strong> {productInfo.offer_id}</div>
                        <div><strong>SKU:</strong> {productInfo.sku}</div>
                        <div><strong>Название:</strong> {productInfo.name}</div>
                        {productInfo.barcode && <div><strong>Штрихкод:</strong> {productInfo.barcode}</div>}
                        {productInfo.weight && <div><strong>Вес:</strong> {productInfo.weight} {productInfo.weight_unit}</div>}
                      </div>
                    </div>

                    {/* Атрибуты */}
                    {productInfo.attributes && productInfo.attributes.length > 0 && (
                      <div style={{ marginBottom: '20px' }}>
                        <h3>Характеристики ({productInfo.attributes.length})</h3>
                        <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#e9ecef' }}>
                                <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>ID</th>
                                <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Значение</th>
                              </tr>
                            </thead>
                            <tbody>
                              {productInfo.attributes.map((attr, attrIndex) => (
                                <tr key={attrIndex}>
                                  <td style={{ padding: '8px', border: '1px solid #dee2e6', fontWeight: 'bold' }}>
                                    {attr.id}
                                  </td>
                                  <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                                    {attr.values && attr.values.map((v, i) => (
                                      <span key={i}>
                                        {v.value}
                                        {i < attr.values.length - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Изображения */}
                    {productInfo.images && productInfo.images.length > 0 && (
                      <div>
                        <h3>Изображения ({productInfo.images.length})</h3>
                        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto' }}>
                          {productInfo.images.map((image, imgIndex) => (
                            <img
                              key={imgIndex}
                              src={image}
                              alt={`Product ${imgIndex + 1}`}
                              style={{
                                height: '100px',
                                width: 'auto',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d' }}>
                Атрибуты не найдены
              </div>
            )}
          </div>
        </div>
      )}

      {/* Модальное окно для копирования товара */}
      {copyModalOpen && (
        <div style={{
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
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '100%'
          }}>
            <h2>Копировать товар</h2>
            <p>Исходный артикул: <strong>{selectedProduct?.offer_id}</strong></p>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Новый артикул *:
              </label>
              <input
                type="text"
                value={copyForm.new_offer_id}
                onChange={(e) => setCopyForm(prev => ({ ...prev, new_offer_id: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
                placeholder="Введите новый артикул"
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Название товара:
              </label>
              <input
                type="text"
                value={copyForm.name}
                onChange={(e) => setCopyForm(prev => ({ ...prev, name: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
                placeholder="Новое название товара"
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Цвет:
              </label>
              <input
                type="text"
                value={copyForm.color}
                onChange={(e) => setCopyForm(prev => ({ ...prev, color: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
                placeholder="Новый цвет"
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                Описание:
              </label>
              <textarea
                value={copyForm.description}
                onChange={(e) => setCopyForm(prev => ({ ...prev, description: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  minHeight: '80px'
                }}
                placeholder="Новое описание"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Цена:
                </label>
                <input
                  type="text"
                  value={copyForm.price}
                  onChange={(e) => setCopyForm(prev => ({ ...prev, price: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                  placeholder="Цена"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Старая цена:
                </label>
                <input
                  type="text"
                  value={copyForm.old_price}
                  onChange={(e) => setCopyForm(prev => ({ ...prev, old_price: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                  placeholder="Старая цена"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCopyModalOpen(false)}
                disabled={copyLoading}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: copyLoading ? 'not-allowed' : 'pointer'
                }}
              >
                Отмена
              </button>
              <button
                onClick={copyProduct}
                disabled={copyLoading || !copyForm.new_offer_id}
                style={{
                  padding: '10px 20px',
                  backgroundColor: copyLoading || !copyForm.new_offer_id ? '#6c757d' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: copyLoading || !copyForm.new_offer_id ? 'not-allowed' : 'pointer'
                }}
              >
                {copyLoading ? 'Копирование...' : 'Создать копию'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
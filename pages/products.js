// pages/products.js
import { useState, useEffect, useCallback } from 'react';
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

  const [attributes, setAttributes] = useState(null);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

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

  const [error, setError] = useState(null);

  // load profile once
  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  // fetchProducts function
  const fetchProducts = useCallback(async (reset = false) => {
    if (!currentProfile) return; // wait for profile
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const params = {
        limit: pagination.limit
      };
      if (!reset && pagination.last_id) params.last_id = pagination.last_id;
      if (filters.offer_id) params.offer_id = filters.offer_id;

      const result = await apiClient.getProducts(pagination.limit, currentProfile, params);
      // expect OZON response structure: { result: { items: [], last_id: '' } } or direct array depending on service
      if (result?.result?.items) {
        const items = result.result.items;
        setProducts(prev => reset ? items : [...prev, ...items]);
        setPagination(prev => ({
          ...prev,
          last_id: result.result.last_id || '',
          hasMore: !!result.result.last_id && items.length === prev.limit
        }));
      } else if (Array.isArray(result)) {
        // fallback if api returns array directly
        setProducts(prev => reset ? result : [...prev, ...result]);
        setPagination(prev => ({ ...prev, hasMore: result.length === prev.limit }));
      } else {
        // unknown format
        console.warn('Unexpected products response', result);
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

  // fetchAttributes
  const fetchAttributes = async (offerId) => {
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль');
      return;
    }
    setLoadingAttributes(true);
    setSelectedProduct(offerId);
    setAttributes(null);

    try {
      const data = await apiClient.getAttributes(offerId, currentProfile);
      setAttributes(data);
    } catch (err) {
      console.error('fetchAttributes error', err);
      setAttributes({ error: err.message || 'Failed to load attributes' });
    } finally {
      setLoadingAttributes(false);
    }
  };

  const closeAttributes = () => {
    setAttributes(null);
    setSelectedProduct(null);
  };

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

  const copyProduct = async () => {
    if (!copyForm.new_offer_id) {
      alert('Пожалуйста, введите новый артикул');
      return;
    }
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль');
      return;
    }

    setCopyLoading(true);
    try {
      const modifications = {};
      if (copyForm.name && copyForm.name !== selectedProduct.name) modifications.name = copyForm.name;
      if (copyForm.color) modifications.color = copyForm.color;
      if (copyForm.description) modifications.description = copyForm.description;
      if (copyForm.price) modifications.price = copyForm.price;
      if (copyForm.old_price) modifications.old_price = copyForm.old_price;

      const result = await apiClient.copyProduct(
        selectedProduct.offer_id,
        copyForm.new_offer_id,
        modifications,
        currentProfile
      );

      console.log('copy result', result);
      alert('Товар успешно скопирован!');
      setCopyModalOpen(false);
      // обновляем список
      fetchProducts(true);
    } catch (err) {
      console.error('copyProduct error', err);
      alert('Ошибка при копировании: ' + (err.message || err));
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
            <div style={{ fontSize: 12 }}>Client ID: {currentProfile.ozon_client_id?.slice(0, 8)}...</div>
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
                <td style={{ padding: 12 }}>{product.product_id}</td>
                <td style={{ padding: 12, fontWeight: 'bold' }}>{product.offer_id}</td>
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
      {attributes && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
        }}>
          <div style={{ backgroundColor: 'white', padding: 30, borderRadius: 8, maxWidth: 800, maxHeight: '80vh', overflow: 'auto', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2>Атрибуты товара: {selectedProduct}</h2>
              <button onClick={closeAttributes} style={{ padding: '8px 16px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: 4 }}>Закрыть</button>
            </div>

            {attributes.error ? (
              <div style={{ color: '#dc3545', padding: 20, textAlign: 'center' }}>Ошибка: {attributes.error}</div>
            ) : attributes.result && attributes.result.length > 0 ? (
              <div>
                {attributes.result.map((productInfo, idx) => (
                  <div key={idx} style={{ marginBottom: 20 }}>
                    <div style={{ marginBottom: 12, padding: 15, backgroundColor: '#f8f9fa', borderRadius: 4 }}>
                      <h3>Основная информация</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div><strong>ID:</strong> {productInfo.id}</div>
                        <div><strong>Артикул:</strong> {productInfo.offer_id}</div>
                        <div><strong>SKU:</strong> {productInfo.sku}</div>
                        <div><strong>Название:</strong> {productInfo.name}</div>
                        {productInfo.barcode && <div><strong>Штрихкод:</strong> {productInfo.barcode}</div>}
                        {productInfo.weight && <div><strong>Вес:</strong> {productInfo.weight} {productInfo.weight_unit}</div>}
                      </div>
                    </div>

                    {productInfo.attributes && productInfo.attributes.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <h3>Характеристики ({productInfo.attributes.length})</h3>
                        <div style={{ maxHeight: 300, overflow: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#e9ecef' }}>
                                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>ID</th>
                                <th style={{ padding: 8, border: '1px solid #dee2e6', textAlign: 'left' }}>Значение</th>
                              </tr>
                            </thead>
                            <tbody>
                              {productInfo.attributes.map((attr, aIdx) => (
                                <tr key={aIdx}>
                                  <td style={{ padding: 8, border: '1px solid #dee2e6', fontWeight: 'bold' }}>{attr.id}</td>
                                  <td style={{ padding: 8, border: '1px solid #dee2e6' }}>
                                    {attr.values && attr.values.map((v, i) => (
                                      <span key={i}>{v.value}{i < attr.values.length - 1 ? ', ' : ''}</span>
                                    ))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {productInfo.images && productInfo.images.length > 0 && (
                      <div>
                        <h3>Изображения ({productInfo.images.length})</h3>
                        <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
                          {productInfo.images.map((img, imIdx) => (
                            <img key={imIdx} src={img} alt={`img-${imIdx}`} style={{ height: 100, width: 'auto', border: '1px solid #ddd', borderRadius: 4 }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: '#6c757d' }}>Атрибуты не найдены</div>
            )}
          </div>
        </div>
      )}

      {copyModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: 30, borderRadius: 8, maxWidth: 500, width: '100%' }}>
            <h2>Копировать товар</h2>
            <p>Исходный артикул: <strong>{selectedProduct?.offer_id}</strong></p>

            {/* form inputs (as before) */}
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Новый артикул *:</label>
              <input value={copyForm.new_offer_id} onChange={(e) => setCopyForm(prev => ({ ...prev, new_offer_id: e.target.value }))} placeholder="Введите новый артикул" style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Название товара:</label>
              <input value={copyForm.name} onChange={(e) => setCopyForm(prev => ({ ...prev, name: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Цвет:</label>
              <input value={copyForm.color} onChange={(e) => setCopyForm(prev => ({ ...prev, color: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Описание:</label>
              <textarea value={copyForm.description} onChange={(e) => setCopyForm(prev => ({ ...prev, description: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4, minHeight: 80 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Цена:</label>
                <input value={copyForm.price} onChange={(e) => setCopyForm(prev => ({ ...prev, price: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Старая цена:</label>
                <input value={copyForm.old_price} onChange={(e) => setCopyForm(prev => ({ ...prev, old_price: e.target.value }))} style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 4 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCopyModalOpen(false)} disabled={copyLoading} style={{ padding: '10px 20px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: 4 }}>Отмена</button>
              <button onClick={copyProduct} disabled={copyLoading || !copyForm.new_offer_id} style={{ padding: '10px 20px', backgroundColor: copyLoading || !copyForm.new_offer_id ? '#6c757d' : '#28a745', color: 'white', border: 'none', borderRadius: 4 }}>
                {copyLoading ? 'Копирование...' : 'Создать копию'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

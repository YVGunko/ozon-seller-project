import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import UserProfiles from '../src/components/UserProfiles';
import { ProfileManager } from '../src/utils/profileManager';
import { useWarehouses } from '../src/hooks/useWarehouses';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('products');
  const [currentProfile, setCurrentProfile] = useState(null);
  const [showProfilesModal, setShowProfilesModal] = useState(false);
  const [requestLogs, setRequestLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const {
    warehouses,
    loading: warehousesLoading,
    error: warehouseError,
    selectedWarehouse,
    refreshWarehouses,
    selectWarehouse
  } = useWarehouses(currentProfile);

  // Загружаем текущий профиль при монтировании
  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  const handleProfileChange = (profile) => {
    setCurrentProfile(profile);
    console.log('Profile changed:', profile);
    // Можно закрыть модальное окно после выбора профиля
    setShowProfilesModal(false);
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/products?limit=5');
      const data = await response.json();
      setProducts(data.result?.items || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/orders');
      const data = await response.json();
      console.log('Orders:', data);
      // Обработка заказов
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequestLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const response = await fetch('/api/logs');
      if (!response.ok) {
        throw new Error('Failed to load request logs');
      }
      const data = await response.json();
      setRequestLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch request logs:', error);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequestLogs();
    const interval = setInterval(fetchRequestLogs, 10000);
    return () => clearInterval(interval);
  }, [fetchRequestLogs]);

  const handleLogOfferClick = (offerId) => {
    if (!offerId) return;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('openAttributesOffer', offerId);
      window.location.href = `/products?offer_id=${encodeURIComponent(offerId)}&openAttributes=true`;
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>OZON Seller Dashboard</h1>

      {/* Отображение текущего профиля */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px'
      }}>
        <div>
          {currentProfile ? (
            <div>
              <span style={{ fontWeight: 'bold', color: '#28a745' }}>✅ Активный профиль:</span>
              <span style={{ marginLeft: '10px' }}><strong>{currentProfile.name}</strong></span>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                Client ID: {currentProfile.ozon_client_id?.slice(0, 10)}...
              </div>
            </div>
          ) : (
            <div style={{ color: '#dc3545' }}>
              ⚠️ Профиль OZON не выбран
            </div>
          )}
        </div>
        
        <button
          onClick={() => setShowProfilesModal(true)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Управление профилями
        </button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '200px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Текущий склад</div>
              {warehousesLoading ? (
                <div style={{ fontSize: '13px', color: '#6c757d' }}>Загрузка списка складов...</div>
              ) : warehouses.length ? (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <select
                    value={selectedWarehouse?.warehouse_id || ''}
                    onChange={(e) => selectWarehouse(e.target.value)}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #ced4da',
                      minWidth: '260px'
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
                <div style={{ fontSize: '13px', color: '#6c757d' }}>
                  Список складов пуст. Попробуйте обновить.
                </div>
              )}
              {selectedWarehouse && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#6c757d' }}>
                  Выбран: {selectedWarehouse.name} ({selectedWarehouse.status_label || selectedWarehouse.status || '—'})
                </div>
              )}
              {warehouseError && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#dc3545' }}>{warehouseError}</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <Link href="/import-excel" passHref>
          <div style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#28a745',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            marginRight: '10px'
          }}>
            📊 Импорт из Excel
          </div>
        </Link>
        <Link href="/products" passHref>
          <div style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#17a2b8',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            marginRight: '10px'
          }}>
            📦 Управление товарами
          </div>
        </Link>
        <Link href="/attention" passHref>
          <div style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#ffc107',
            color: '#212529',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}>
            ⚠️ Товары без внимания
          </div>
        </Link>
        
        <div style={{ marginTop: '15px' }}>
          <button
            onClick={() => setActiveTab('products')}
            style={{ 
              marginRight: '10px', 
              padding: '10px 15px', 
              backgroundColor: activeTab === 'products' ? '#0070f3' : '#ccc', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            style={{ 
              padding: '10px 15px', 
              backgroundColor: activeTab === 'orders' ? '#0070f3' : '#ccc', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Orders
          </button>
        </div>
      </div>

      {activeTab === 'products' && (
        <div>
          <button
            onClick={fetchProducts}
            disabled={loading}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#0070f3', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px', 
              cursor: loading ? 'not-allowed' : 'pointer' 
            }}
          >
            {loading ? 'Loading...' : 'Get Products'}
          </button>

          {products.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h2>Products ({products.length})</h2>
              {products.map(product => (
                <div key={product.product_id} style={{ border: '1px solid #ddd', margin: '10px 0', padding: '15px', borderRadius: '5px' }}>
                  <h3>Product ID: {product.product_id}</h3>
                  <p>Offer ID: {product.offer_id}</p>
                  <p>Archived: {product.archived ? 'Yes' : 'No'}</p>
                  <p>Discounted: {product.is_discounted ? 'Yes' : 'No'}</p>
                  <p>FBS Stocks: {product.has_fbs_stocks ? 'Yes' : 'No'}</p>
                  <p>FBO Stocks: {product.has_fbo_stocks ? 'Yes' : 'No'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div>
          <button
            onClick={fetchOrders}
            disabled={loading}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#0070f3', 
              color: 'white', 
              border: 'none', 
              borderRadius: '5px', 
              cursor: loading ? 'not-allowed' : 'pointer' 
            }}
          >
            {loading ? 'Loading...' : 'Get Orders'}
          </button>
          <p style={{ marginTop: '10px' }}>Orders functionality coming soon...</p>
        </div>
      )}

      <div style={{ marginTop: '40px' }}>
        <h2>Логи запросов к OZON</h2>
        <p style={{ color: '#6c757d', fontSize: '13px' }}>
          Здесь отображаются последние запросы на обновление атрибутов товаров.
        </p>

        {logsLoading && (
          <div style={{ padding: '10px 0', color: '#0070f3' }}>Загрузка логов...</div>
        )}

        {!logsLoading && requestLogs.length === 0 && (
          <div style={{ padding: '10px 0', color: '#6c757d' }}>
            Логи пока отсутствуют.
          </div>
        )}

        {requestLogs.length > 0 && (
          <div style={{ overflowX: 'auto', marginTop: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f3f5' }}>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Offer ID</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Product ID</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Endpoint</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Method</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Duration (ms)</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Error</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>User</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Task ID</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Status message</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Barcode</th>
                  <th style={{ padding: '8px', border: '1px solid #dee2e6', textAlign: 'left' }}>Barcode error</th>
                </tr>
              </thead>
              <tbody>
                {requestLogs.map((log, index) => (
                  <tr key={`${log.timestamp}-${index}`} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa' }}>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                      {log.offer_id ? (
                        <button
                          type="button"
                          onClick={() => handleLogOfferClick(log.offer_id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: '#0070f3',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          {log.offer_id}
                        </button>
                      ) : (
                        <span style={{ color: '#6c757d' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{log.product_id || '—'}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6', fontFamily: 'monospace' }}>{log.endpoint || '—'}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{log.method || '—'}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6', color: log.status >= 400 ? '#dc3545' : '#28a745' }}>
                      {log.status ?? '—'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>
                      {typeof log.duration_ms === 'number' ? log.duration_ms : '—'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6', color: '#dc3545' }}>
                      {log.error_message || '—'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{log.user_id || '—'}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{log.task_id || '—'}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6', fontSize: '12px', color: '#495057' }}>
                      {log.import_message || '—'}
                    </td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6' }}>{log.barcode || '—'}</td>
                    <td style={{ padding: '8px', border: '1px solid #dee2e6', color: '#dc3545' }}>{log.barcode_error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Модальное окно управления профилями */}
      {showProfilesModal && (
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
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={() => setShowProfilesModal(false)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                padding: '8px 12px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ✕
            </button>
            
            <h2 style={{ marginBottom: '20px' }}>Управление профилями OZON</h2>
            
            <UserProfiles onProfileChange={handleProfileChange} />
            
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button
                onClick={() => setShowProfilesModal(false)}
                style={{
                  padding: '10px 20px',
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
          </div>
        </div>
      )}
    </div>
  );
}

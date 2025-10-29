import { useState, useEffect } from 'react';
import Link from 'next/link';
import UserProfiles from '../src/components/UserProfiles';
import { ProfileManager } from '../src/utils/profileManager';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('products');
  const [currentProfile, setCurrentProfile] = useState(null);
  const [showProfilesModal, setShowProfilesModal] = useState(false);

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
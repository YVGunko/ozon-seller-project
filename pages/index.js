import { useState, useEffect } from 'react';
import Link from 'next/link';
import UserProfiles from '../src/components/UserProfiles';
import { ProfileManager } from '../src/utils/profileManager';
import { useWarehouses } from '../src/hooks/useWarehouses';
import { signOut, useSession } from 'next-auth/react';

export default function Home() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('products');
  const [currentProfile, setCurrentProfile] = useState(null);
  const [showProfilesModal, setShowProfilesModal] = useState(false);
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

  const fetchOrders = async () => {
    setLoading(true);
    try {
      if (!currentProfile) {
        alert('Сначала выберите профиль');
        return;
      }
      const response = await fetch(`/api/orders?profileId=${encodeURIComponent(currentProfile.id)}`);
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
                Client ID: {currentProfile?.client_hint || '—'}
              </div>
            </div>
          ) : (
            <div style={{ color: '#dc3545' }}>
              ⚠️ Профиль OZON не выбран
            </div>
          )}
        </div>
        {session?.user && (
          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>
            Вошли как: {session.user.name || session.user.id}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
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
          <button
            onClick={() => {
              ProfileManager.clearProfile();
              signOut({ callbackUrl: '/auth/signin' });
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Выйти
          </button>
        </div>
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
          Товары
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
          Заказы
        </button>
      </div>

      {activeTab === 'products' && (
        <div>
          <div style={{ marginBottom: '15px' }}>
            <Link href="/import-excel" passHref>
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  marginRight: '10px'
                }}
              >
                📊 Импорт из Excel
              </div>
            </Link>
            <Link href="/products" passHref>
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  marginRight: '10px'
                }}
              >
                📦 Управление товарами
              </div>
            </Link>
            <Link href="/attention" passHref>
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#ffc107',
                  color: '#212529',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  marginRight: '10px'
                }}
              >
                ⚠️ Товары без внимания
              </div>
            </Link>
            <Link href="/product-cloner" passHref>
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#0ea5e9',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  marginRight: '10px'
                }}
              >
                ✳️ Клонирование товаров
              </div>
            </Link>
            <Link href="/product-copier" passHref>
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#f97316',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  marginRight: '10px'
                }}
              >
                ♻️ Копирование товаров
              </div>
            </Link>
            <Link href="/logs" passHref>
              <div
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#6f42c1',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold'
                }}
              >
                📜 Логи импорта в OZON
              </div>
            </Link>
          </div>

          <div style={{ marginTop: '10px', color: '#6c757d' }}>
            Работа с товарами доступна на отдельных страницах выше.
          </div>
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
            {loading ? 'Загрузка…' : 'Загрузить заказы'}
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

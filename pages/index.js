import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import UserProfiles from '../src/components/UserProfiles';
import { useWarehouses } from '../src/hooks/useWarehouses';
import { signOut } from 'next-auth/react';
import { useCurrentContext } from '../src/hooks/useCurrentContext';
import { useAccess } from '../src/hooks/useAccess';

export default function Home() {
  const router = useRouter();

  const isOrdersActive = router.pathname.startsWith('/postings');
  const isActionsActive = router.pathname.startsWith('/actions');

  const { profile: contextProfile } = useCurrentContext();
  const {
    user,
    canManageUsers,
    canManageOrders,
    canManagePrices,
    canManageEnterprises
  } = useAccess();
  const [currentProfile, setCurrentProfile] = useState(contextProfile || null);
  const [showProfilesModal, setShowProfilesModal] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [productsMenuOpen, setProductsMenuOpen] = useState(false);

  const {
    warehouses,
    loading: warehousesLoading,
    error: warehouseError,
    selectedWarehouse,
    refreshWarehouses,
    selectWarehouse
  } = useWarehouses(currentProfile);

  // Синхронизируем локальное состояние профиля с контекстом,
  // если профиль был изменён в другой части приложения.
  useEffect(() => {
    setCurrentProfile(contextProfile || null);
  }, [contextProfile]);

  const handleProfileChange = (profile) => {
    // Мгновенно обновляем локальный профиль для UI,
    // ProfileManager уже обновлён внутри UserProfiles.
    setCurrentProfile(profile || null);
    setShowProfilesModal(false);
  };

  return (
    <div className="oz-page">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: 240,
            background: 'linear-gradient(180deg, #0f172a, #020617)',
            color: '#e5e7eb',
            padding: '16px 16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            zIndex: 1500,
            boxShadow: '4px 0 18px rgba(15,23,42,0.45)'
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            OZON Seller
          </div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#9ca3af' }}>
            Профиль
          </div>
          <div
            style={{
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.4)',
              padding: 10,
              background: 'rgba(15,23,42,0.7)'
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {currentProfile ? currentProfile.name : 'Профиль не выбран'}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
              Client ID: {currentProfile?.client_hint || '—'}
            </div>
            {user && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Пользователь: {user.name || user.username || user.id}
              </div>
            )}
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <button
                className="oz-btn oz-btn-secondary"
                style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => setShowProfilesModal(true)}
              >
                Профили
              </button>
              <button
                className="oz-btn oz-btn-secondary"
                style={{ padding: '4px 10px', fontSize: 11, opacity: user ? 1 : 0.6 }}
                onClick={() => {
                  // Профиль очищается внутри UserProfiles / ProfileManager,
                  // здесь достаточно выйти из сессии.
                  signOut({ callbackUrl: '/auth/signin' });
                }}
              >
                Выйти
              </button>
            </div>
          </div>

          {currentProfile && (
            <>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#9ca3af' }}>
                Склад
              </div>
              <div
                style={{
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.4)',
                  padding: 10,
                  background: 'rgba(15,23,42,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                {warehousesLoading ? (
                  <div style={{ fontSize: 12 }}>Загрузка складов…</div>
                ) : warehouses.length > 0 ? (
                  <>
                    <select
                      className="oz-input"
                      value={selectedWarehouse?.warehouse_id || ''}
                      onChange={(e) => selectWarehouse(e.target.value)}
                      style={{ width: '100%', fontSize: 12 }}
                    >
                      <option value="">Не выбран</option>
                      {warehouses.map((w) => (
                        <option key={w.warehouse_id} value={w.warehouse_id}>
                          {w.name} — {w.status_label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="oz-btn oz-btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 11, alignSelf: 'flex-start' }}
                      onClick={refreshWarehouses}
                    >
                      Обновить склады
                    </button>
                    {selectedWarehouse && (
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        <div>Склад: {selectedWarehouse.name}</div>
                        <div>Статус: {selectedWarehouse.status_label}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>Склады не найдены</div>
                )}
                {warehouseError && (
                  <div style={{ fontSize: 11, color: '#fecaca' }}>{warehouseError}</div>
                )}
              </div>
            </>
          )}

          <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#9ca3af' }}>
            Разделы
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <button
                type="button"
                onClick={() => {
                  setProductsMenuOpen((prev) => !prev);
                }}
                style={{
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  backgroundColor: productsMenuOpen ? '#e5e7eb' : 'transparent',
                  color: productsMenuOpen ? '#0f172a' : '#e5e7eb'
                }}
              >
                <span>Товары</span>
                <span style={{ fontSize: 12 }}>{productsMenuOpen ? '▾' : '▸'}</span>
              </button>
              {productsMenuOpen && (
                <div
                  style={{
                    marginTop: 4,
                    marginLeft: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <Link href="/products">
                    <div style={sidebarSubItemStyle}>
                      <span>Управление товарами</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/product-copier">
                    <div style={sidebarSubItemStyle}>
                      <span>Копирование товаров</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/product-cloner">
                    <div style={sidebarSubItemStyle}>
                      <span>Клонирование товаров</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/ozon-prod-copier">
                    <div style={sidebarSubItemStyle}>
                      <span>Копирование товара по ссылке OZON</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/attention">
                    <div style={sidebarSubItemStyle}>
                      <span>Товары без внимания</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/import-excel">
                    <div style={sidebarSubItemStyle}>
                      <span>Импорт из Excel</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/logs">
                    <div style={sidebarSubItemStyle}>
                      <span>Логи импорта</span>
                      <span>›</span>
                    </div>
                  </Link>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push('/postings')}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '8px 10px',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 13,
                backgroundColor: isOrdersActive ? '#e5e7eb' : 'transparent',
                color: isOrdersActive ? '#0f172a' : '#e5e7eb',
                opacity: canManageOrders ? 1 : 0.4,
                pointerEvents: canManageOrders ? 'auto' : 'none'
              }}
            >
              Заказы
            </button>
            <button
              type="button"
              onClick={() => router.push('/actions')}
              style={{
                border: 'none',
                borderRadius: 8,
                padding: '8px 10px',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 13,
                backgroundColor: isActionsActive ? '#e5e7eb' : 'transparent',
                color: isActionsActive ? '#0f172a' : '#e5e7eb',
                opacity: canManagePrices ? 1 : 0.4,
                pointerEvents: canManagePrices ? 'auto' : 'none'
              }}
            >
              Акции и цены
            </button>
            {canManageUsers && (
              <Link href="/admin/users">
                <div style={sidebarSubItemStyle}>
                  <span>Пользователи (admin)</span>
                  <span>›</span>
                </div>
              </Link>
            )}
            {canManageEnterprises && (
              <Link href="/admin/enterprises">
                <div style={sidebarSubItemStyle}>
                  <span>Организации (Enterprise)</span>
                  <span>›</span>
                </div>
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            style={{
              marginTop: 'auto',
              border: 'none',
              borderRadius: 9999,
              padding: '6px 10px',
              fontSize: 12,
              backgroundColor: 'rgba(15,23,42,0.9)',
              color: '#e5e7eb',
              cursor: 'pointer'
            }}
          >
            Скрыть панель
          </button>
        </aside>
      )}

      <button
        type="button"
        onClick={() => setSidebarOpen((prev) => !prev)}
        style={{
          position: 'fixed',
          top: 16,
          left: sidebarOpen ? 252 : 16,
          zIndex: 1600,
          borderRadius: 9999,
          border: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          padding: '4px 10px',
          fontSize: 13,
          cursor: 'pointer',
          boxShadow: '0 4px 10px rgba(15,23,42,0.15)'
        }}
      >
        {sidebarOpen ? '⟨' : '☰'}
      </button>

      <div style={{ marginLeft: sidebarOpen ? 260 : 0, transition: 'margin-left 0.2s ease' }}>
        {/* ───────────────────────────────────── */}
        {/* Breadcrumb + Title */}
        {/* ───────────────────────────────────── */}
        <div className="oz-page-header">
          <div className="oz-breadcrumb">
            <span className="oz-breadcrumb-link">Главная</span>
          </div>

          <div className="oz-page-title-block">
            <h1 className="oz-page-title">Панель продавца OZON</h1>
            <p className="oz-page-subtitle">Управляйте товарами, заказами и ценами</p>
          </div>
        </div>


        <div className="oz-main">
          {/* ───────────────────────────────────── */}
          {/* Dashboard metrics (пока статичные)   */}
          {/* ───────────────────────────────────── */}
          <div className="oz-card" style={{ marginBottom: 20 }}>
            <div className="oz-card-header">
              <h2 className="oz-card-title">Обзор магазина</h2>
              <span className="oz-card-subtitle">
                Здесь будут живые метрики по заказам, товарам и акциям
              </span>
            </div>
            <div className="oz-card-body">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: 16
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe'
                  }}
                >
                  <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#1d4ed8' }}>
                    Заказы сегодня
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>—</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Количество оформленных заказов за текущий день
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: '#fef3c7',
                    border: '1px solid #fde68a'
                  }}
                >
                  <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#b45309' }}>
                    Низкий контент‑рейтинг
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>—</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Товары, которые требуют доработки описаний и атрибутов
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: '#ecfdf5',
                    border: '1px solid #bbf7d0'
                  }}
                >
                  <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#15803d' }}>
                    Без фотографий
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>—</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Количество товаров без основных изображений
                  </div>
                </div>

                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: '#f5f3ff',
                    border: '1px solid #ddd6fe'
                  }}
                >
                  <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#6d28d9' }}>
                    Активные акции
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 600, marginTop: 6 }}>—</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Сколько акций сейчас влияет на ваши цены
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* здесь позже можно добавить дополнительные блоки дашборда */}
        </div>

        {/* ─────────────────── */}
        {/* MODAL: ПРОФИЛИ     */}
        {/* ─────────────────── */}
        {showProfilesModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 2000
            }}
          >
            <div
              style={{
                background: 'white',
                padding: '20px',
                borderRadius: '12px',
                maxHeight: '80vh',
                overflowY: 'auto',
                width: '600px'
              }}
            >
              <h2>Управление профилями</h2>
              <UserProfiles onProfileChange={handleProfileChange} />

              <div style={{ marginTop: '15px', textAlign: 'right' }}>
                <button
                  className="oz-btn oz-btn-secondary"
                  onClick={() => setShowProfilesModal(false)}
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const sidebarSubItemStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  color: '#e5e7eb',
  backgroundColor: 'rgba(15,23,42,0.4)'
};

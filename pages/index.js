import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import UserProfiles from '../src/components/UserProfiles';
import { useWarehouses } from '../src/hooks/useWarehouses';
import { signOut } from 'next-auth/react';
import { useCurrentContext } from '../src/hooks/useCurrentContext';
import { useAccess } from '../src/hooks/useAccess';
import { clearUserScopedStorage } from '../src/utils/userScopedStorage';

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
    canManageEnterprises,
    canManagePrompts
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
        <aside className="oz-sidebar">
          <div className="oz-sidebar-header">OZON Seller</div>
          <div className="oz-sidebar-section-label">Профиль</div>
          <div className="oz-sidebar-card">
            <div>
              Магазин: {currentProfile ? currentProfile.name : 'Профиль не выбран'}
            </div>

            {user && (
              <div>
                Пользователь: {user.name || user.username || user.id}
              </div>
            )}
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <button
                className="oz-btn oz-btn-secondary"
                onClick={() => setShowProfilesModal(true)}
              >
                Профили
              </button>
              <button
                className="oz-btn oz-btn-secondary"
                style={{ opacity: user ? 1 : 0.6 }}
                onClick={() => {
                  clearUserScopedStorage();
                  signOut({ callbackUrl: '/auth/signin' });
                }}
              >
                Выйти
              </button>
            </div>
          </div>

          {currentProfile && (
            <>
              <div className="oz-sidebar-section-label">Склад</div>
              <div className="oz-sidebar-card oz-sidebar-card--secondary">
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
                      onClick={() => refreshWarehouses({ force: true })}
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

          <div className="oz-sidebar-section-label">Разделы</div>
          <nav className="oz-sidebar-nav">
            <div>
              <button
                type="button"
                onClick={() => {
                  setProductsMenuOpen((prev) => !prev);
                }}
                className={`oz-sidebar-nav-button ${
                  productsMenuOpen ? 'oz-sidebar-nav-button--active' : ''
                }`}
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
                    <div className="oz-sidebar-subitem">
                      <span>Управление товарами</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/product-copier">
                    <div className="oz-sidebar-subitem">
                      <span>Копирование товаров</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/product-cloner">
                    <div className="oz-sidebar-subitem">
                      <span>Клонирование товаров</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/ozon-prod-copier">
                    <div className="oz-sidebar-subitem">
                      <span>Копирование товара по ссылке OZON</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/attention">
                    <div className="oz-sidebar-subitem">
                      <span>Товары без внимания</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/import-excel">
                    <div className="oz-sidebar-subitem">
                      <span>Импорт из Excel</span>
                      <span>›</span>
                    </div>
                  </Link>
                  <Link href="/logs">
                    <div className="oz-sidebar-subitem">
                      <span>Логи импорта</span>
                      <span>›</span>
                    </div>
                  </Link>
                  {canManagePrompts && (
                    <Link href="/ai/prompts">
                      <div className="oz-sidebar-subitem">
                        <span>AI промпты</span>
                        <span>›</span>
                      </div>
                    </Link>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push('/postings')}
              className={`oz-sidebar-nav-button ${
                isOrdersActive ? 'oz-sidebar-nav-button--active' : ''
              } ${canManageOrders ? '' : 'oz-sidebar-nav-button--disabled'}`}
            >
              Заказы
            </button>
            <button
              type="button"
              onClick={() => router.push('/actions')}
              className={`oz-sidebar-nav-button ${
                isActionsActive ? 'oz-sidebar-nav-button--active' : ''
              } ${canManagePrices ? '' : 'oz-sidebar-nav-button--disabled'}`}
            >
              Акции и цены
            </button>
            {canManageUsers && (
              <Link href="/admin/users">
                <div className="oz-sidebar-subitem">
                  <span>Пользователи (admin)</span>
                  <span>›</span>
                </div>
              </Link>
            )}
            {canManageUsers && (
              <Link href="/admin/sellers">
                <div className="oz-sidebar-subitem">
                  <span>Магазины</span>
                  <span>›</span>
                </div>
              </Link>
            )}
            {canManageEnterprises && (
              <Link href="/admin/enterprises">
                <div className="oz-sidebar-subitem">
                  <span>Организации (Enterprise)</span>
                  <span>›</span>
                </div>
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="oz-sidebar-footer-button"
          >
            Скрыть панель
          </button>
        </aside>
      )}

      <button
        type="button"
        onClick={() => setSidebarOpen((prev) => !prev)}
        className={`oz-sidebar-toggle ${
          sidebarOpen ? 'oz-sidebar-toggle--shifted' : ''
        }`}
      >
        {sidebarOpen ? '⟨' : '☰'}
      </button>

      <div
        className={`oz-content-with-sidebar ${
          sidebarOpen ? '' : 'oz-content-with-sidebar--collapsed'
        }`}
      >
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
          <div className="oz-dashboard-card">
            <div className="oz-dashboard-card-header">
              <h2 className="oz-dashboard-card-title">Обзор магазина</h2>
              <span className="oz-dashboard-card-subtitle">
                Здесь будут живые метрики по заказам, товарам и акциям
              </span>
            </div>
            <div className="oz-dashboard-card-body">
              <div className="oz-dashboard-metrics-grid">
                <div className="oz-dashboard-metric oz-dashboard-metric--blue">
                  <div className="oz-dashboard-metric__label">Заказы сегодня</div>
                  <div className="oz-dashboard-metric__value">—</div>
                  <div className="oz-dashboard-metric__description">
                    Количество оформленных заказов за текущий день
                  </div>
                </div>

                <div className="oz-dashboard-metric oz-dashboard-metric--amber">
                  <div className="oz-dashboard-metric__label">Низкий контент‑рейтинг</div>
                  <div className="oz-dashboard-metric__value">—</div>
                  <div className="oz-dashboard-metric__description">
                    Товары, которые требуют доработки описаний и атрибутов
                  </div>
                </div>

                <div className="oz-dashboard-metric oz-dashboard-metric--green">
                  <div className="oz-dashboard-metric__label">Без фотографий</div>
                  <div className="oz-dashboard-metric__value">—</div>
                  <div className="oz-dashboard-metric__description">
                    Количество товаров без основных изображений
                  </div>
                </div>

                <div className="oz-dashboard-metric oz-dashboard-metric--purple">
                  <div className="oz-dashboard-metric__label">Активные акции</div>
                  <div className="oz-dashboard-metric__value">—</div>
                  <div className="oz-dashboard-metric__description">
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
          <div className="oz-modal-overlay">
            <div className="oz-modal">
              <h2>Управление профилями</h2>
              <UserProfiles onProfileChange={handleProfileChange} />

              <div className="oz-modal-footer">
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

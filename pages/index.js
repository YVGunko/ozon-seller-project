import { useState, useEffect } from 'react';
import Link from 'next/link';
import UserProfiles from '../src/components/UserProfiles';
import { ProfileManager } from '../src/utils/profileManager';
import { useWarehouses } from '../src/hooks/useWarehouses';
import { signOut, useSession } from 'next-auth/react';

export default function Home() {
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState('products');
  const [currentProfile, setCurrentProfile] = useState(null);
  const [showProfilesModal, setShowProfilesModal] = useState(false);

  const [actionsLoading, setActionsLoading] = useState(false);
  const [actions, setActions] = useState([]);
  const [actionsError, setActionsError] = useState('');
  const [actionsTotal, setActionsTotal] = useState(0);

  const {
    warehouses,
    loading: warehousesLoading,
    error: warehouseError,
    selectedWarehouse,
    refreshWarehouses,
    selectWarehouse
  } = useWarehouses(currentProfile);

  // Загружаем профиль
  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  const handleProfileChange = (profile) => {
    setCurrentProfile(profile);
    setShowProfilesModal(false);
  };

  const fetchActions = async () => {
    if (!currentProfile) {
      setActionsError('Сначала выберите профиль');
      return;
    }
    setActionsLoading(true);
    setActionsError('');

    try {
      const res = await fetch(`/api/actions?profileId=${currentProfile.id}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error || 'Ошибка загрузки акций');

      const items = json?.result || [];
      setActions(items);

      const total = items.reduce(
        (sum, item) => sum + Number(item?.potential_products_count || 0),
        0
      );
      setActionsTotal(total);
    } catch (err) {
      setActionsError(err.message);
      setActions([]);
      setActionsTotal(0);
    } finally {
      setActionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'prices') {
      fetchActions();
    }
  }, [activeTab, currentProfile]);

  return (
    <div className="oz-page">

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
        {/* Карточка профиля */}
        {/* ───────────────────────────────────── */}
        <div className="oz-card">
          <div className="oz-card-header">
            <h2 className="oz-card-title">Активный профиль</h2>
            <span className="oz-card-subtitle">Текущий магазин и учётные данные</span>
          </div>

          <div className="oz-card-body">
            {currentProfile ? (
              <div className="oz-meta-grid">
                <div>
                  <div className="oz-meta-label">Название профиля</div>
                  <div className="oz-meta-value">{currentProfile.name}</div>
                </div>
                <div>
                  <div className="oz-meta-label">Client ID</div>
                  <div className="oz-meta-code">
                    {currentProfile?.client_hint || '—'}
                  </div>
                </div>
                {session?.user && (
                  <div>
                    <div className="oz-meta-label">Пользователь</div>
                    <div className="oz-meta-value">
                      {session.user.name || session.user.id}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="oz-alert oz-alert-error">
                Профиль не выбран — выберите в настройках.
              </div>
            )}

            <div className="oz-actions">
              <button
                className="oz-btn oz-btn-primary"
                onClick={() => setShowProfilesModal(true)}
              >
                Управление профилями
              </button>

              <button
                className="oz-btn oz-btn-secondary"
                onClick={() => {
                  ProfileManager.clearProfile();
                  signOut({ callbackUrl: '/auth/signin' });
                }}
              >
                Выйти
              </button>
            </div>
          </div>
        </div>


        {/* ───────────────────────────────────── */}
        {/* Карточка склада */}
        {/* ───────────────────────────────────── */}
        {currentProfile && (
          <div className="oz-card">
            <div className="oz-card-header">
              <h2 className="oz-card-title">Склад</h2>
              <span className="oz-card-subtitle">Доступные склады аккаунта</span>
            </div>

            <div className="oz-card-body">
              {warehousesLoading ? (
                <p>Загрузка складов…</p>
              ) : warehouses.length > 0 ? (
                <>
                  <select
                    className="oz-input"
                    value={selectedWarehouse?.warehouse_id || ''}
                    onChange={(e) => selectWarehouse(e.target.value)}
                  >
                    <option value="">Не выбран</option>
                    {warehouses.map((w) => (
                      <option key={w.warehouse_id} value={w.warehouse_id}>
                        {w.name} — {w.status_label}
                      </option>
                    ))}
                  </select>

                  <div className="oz-actions">
                    <button className="oz-btn oz-btn-secondary" onClick={refreshWarehouses}>
                      Обновить
                    </button>
                  </div>

                  {selectedWarehouse && (
                    <div className="oz-meta-grid">
                      <div>
                        <div className="oz-meta-label">Склад</div>
                        <div className="oz-meta-value">{selectedWarehouse.name}</div>
                      </div>
                      <div>
                        <div className="oz-meta-label">Статус</div>
                        <div className="oz-meta-value">{selectedWarehouse.status_label}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="oz-meta-value">Склады не найдены</p>
              )}

              {warehouseError && (
                <div className="oz-alert oz-alert-error">{warehouseError}</div>
              )}
            </div>
          </div>
        )}


        {/* ───────────────────────────────────── */}
        {/* Переключатель табов */}
        {/* ───────────────────────────────────── */}
        <div className="oz-card">
          <div className="oz-card-body">
            <div className="oz-segmented-control">
              <button
                className={`oz-segmented-item ${
                  activeTab === 'products' ? 'oz-segmented-item--active' : ''
                }`}
                onClick={() => setActiveTab('products')}
              >
                Товары
              </button>

              <button
                className={`oz-segmented-item ${
                  activeTab === 'orders' ? 'oz-segmented-item--active' : ''
                }`}
                onClick={() => setActiveTab('orders')}
              >
                Заказы
              </button>

              <button
                className={`oz-segmented-item ${
                  activeTab === 'prices' ? 'oz-segmented-item--active' : ''
                }`}
                onClick={() => setActiveTab('prices')}
              >
                Цены и акции
              </button>
            </div>
          </div>
        </div>


        {/* ───────────────────────────────────── */}
        {/* TAB: ТОВАРЫ */}
        {/* ───────────────────────────────────── */}
        {activeTab === 'products' && (
          <div className="oz-card">
            <div className="oz-card-header">
              <h2 className="oz-card-title">Работа с товарами</h2>
              <span className="oz-card-subtitle">Импорт, редактирование и копирование</span>
            </div>

            <div className="oz-card-body">
              <div className="oz-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/import-excel"><div className="oz-btn oz-btn-success">📊 Импорт из Excel</div></Link>
                <Link href="/products"><div className="oz-btn oz-btn-primary">📦 Управление товарами</div></Link>
                <Link href="/ozon-prod-copier"><div className="oz-btn oz-btn-secondary">Создать товар по ссылке</div></Link>
                <Link href="/attention"><div className="oz-btn oz-btn-secondary">⚠️ Товары без внимания</div></Link>
                <Link href="/product-cloner"><div className="oz-btn oz-btn-secondary">✳️ Клонирование</div></Link>
                <Link href="/product-copier"><div className="oz-btn oz-btn-secondary">♻️ Копирование</div></Link>
                <Link href="/logs"><div className="oz-btn oz-btn-secondary">📜 Логи импорта</div></Link>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────── */}
        {/* TAB: ЗАКАЗЫ */}
        {/* ───────────────────────────────────── */}
        {activeTab === 'orders' && (
          <div className="oz-card">
            <div className="oz-card-header">
              <h2 className="oz-card-title">Заказы</h2>
              <span className="oz-card-subtitle">Загрузка заказов и отправлений</span>
            </div>

            <div className="oz-card-body">
              <p>Скоро появится...</p>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────── */}
        {/* TAB: ЦЕНЫ И АКЦИИ */}
        {/* ───────────────────────────────────── */}
        {activeTab === 'prices' && (
          <div className="oz-card">
            <div className="oz-card-header">
              <h2 className="oz-card-title">Акции и доступные товары</h2>
              <span className="oz-card-subtitle">Количество товаров, подходящих под каждую акцию</span>
            </div>

            <div className="oz-card-body">
              <button
                className="oz-btn oz-btn-primary"
                onClick={fetchActions}
                disabled={actionsLoading}
              >
                {actionsLoading ? 'Обновляем…' : 'Обновить'}
              </button>

              {actionsError && (
                <div className="oz-alert oz-alert-error">{actionsError}</div>
              )}

              {actions.length > 0 && (
                <div className="oz-table-wrapper">
                  <table className="oz-table">
                    <thead>
                      <tr>
                        <th>Акция</th>
                        <th>Тип</th>
                        <th>Период</th>
                        <th>Доступно товаров</th>
                        <th>Участвует товаров</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actions.map((action) => (
                        <tr key={action.id}>
                          <td>
                            <strong>{action.title}</strong>
                          </td>
                          <td>{action.action_type}</td>
                          <td>
                            {formatActionDate(action.date_start)} — {formatActionDate(action.date_end)}
                          </td>
                          <td>{action.potential_products_count}</td>
                          <td>{action.participating_products_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: '12px', fontWeight: 600 }}>
                Всего товаров: {actionsTotal}
              </div>
            </div>
          </div>
        )}

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
              <button className="oz-btn oz-btn-secondary" onClick={() => setShowProfilesModal(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const formatActionDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleDateString('ru-RU');
};

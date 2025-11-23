import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProfileManager } from '../../src/utils/profileManager';

export default function ActionsPage() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [actions, setActions] = useState([]);
  const [actionsError, setActionsError] = useState('');
  const [actionsTotal, setActionsTotal] = useState(0);

  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  const fetchActions = async () => {
    if (!currentProfile) {
      setActionsError('Сначала выберите профиль на главной странице');
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
    if (currentProfile) {
      fetchActions();
    }
  }, [currentProfile]);

  return (
    <div className="oz-page">
      <div className="oz-page-header">
        <div className="oz-breadcrumb">
          <Link href="/" className="oz-breadcrumb-link">
            Главная
          </Link>
          <span className="oz-breadcrumb-separator">/</span>
          <span className="oz-breadcrumb-link">Акции и цены</span>
        </div>

        <div className="oz-page-title-block">
          <h1 className="oz-page-title">Акции и доступные товары</h1>
          <p className="oz-page-subtitle">
            Количество товаров, подходящих под каждую акцию OZON
          </p>
        </div>
      </div>

      <div className="oz-main">
        <div className="oz-card">
          <div className="oz-card-header">
            <h2 className="oz-card-title">Список акций</h2>
            <span className="oz-card-subtitle">
              Используйте акцию, чтобы управлять скидками и бустингом
            </span>
          </div>

          <div className="oz-card-body">
            <button
              className="oz-btn oz-btn-primary"
              onClick={fetchActions}
              disabled={actionsLoading}
            >
              {actionsLoading ? 'Обновляем…' : 'Обновить'}
            </button>

            {actionsError && <div className="oz-alert oz-alert-error">{actionsError}</div>}

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
                      <th>Товары по акции</th>
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
                          {formatActionDate(action.date_start)} —{' '}
                          {formatActionDate(action.date_end)}
                        </td>
                        <td>{action.potential_products_count}</td>
                        <td>{action.participating_products_count}</td>
                        <td>
                          <Link
                            href={{
                              pathname: `/actions/${action.id}`,
                              query: { title: action.title || '' }
                            }}
                            className="oz-btn oz-btn-secondary"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                          >
                            Открыть
                          </Link>
                        </td>
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
      </div>
    </div>
  );
}

const formatActionDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleDateString('ru-RU');
};


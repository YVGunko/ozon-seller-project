import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccess } from '../../src/hooks/useAccess';

export default function SellersAdminPage() {
  const { user, canManageUsers, isRootAdmin } = useAccess();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sellers, setSellers] = useState([]);
  const [enterprises, setEnterprises] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(null);
  const [editingApiKey, setEditingApiKey] = useState(false);

  // На уровне UI разрешаем страницу всем, кто может управлять пользователями (admin + manager).
  // Дополнительные ограничения по Enterprise/Seller уже проверяются на уровне API.
  const canView = Boolean(user && canManageUsers);
  const canEditEnterprise = Boolean(isRootAdmin);

  useEffect(() => {
    if (!canView) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [sellersRes, entRes] = await Promise.all([
          fetch('/api/admin/sellers'),
          fetch('/api/admin/enterprises')
        ]);
        const sellersData = await sellersRes.json();
        const entData = await entRes.json();
        if (!sellersRes.ok) {
          throw new Error(sellersData?.error || 'Не удалось загрузить продавцов');
        }
        if (!entRes.ok) {
          throw new Error(entData?.error || 'Не удалось загрузить организации');
        }
        const items = Array.isArray(sellersData.items) ? sellersData.items : [];
        const ents = Array.isArray(entData.items) ? entData.items : [];
        setSellers(items);
        setEnterprises(ents);
        if (items.length) {
          setSelectedId(items[0].id);
          setForm({ ...items[0] });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[admin/sellers] load error', e);
        setError(e?.message || 'Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [canView]);

  const handleSelect = (seller) => {
    setSelectedId(seller.id);
    // ozon_api_key никогда не приходит с сервера; заполняем пустым,
    // а факт наличия текущего ключа храним в ozon_has_api_key.
    setForm({
      ...seller,
      ozon_api_key: ''
    });
    setEditingApiKey(false);
  };

  const handleChange = (field, value) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleCreate = () => {
    setSelectedId(null);
    setForm({
      id: '',
      name: '',
      ozon_client_id: '',
      ozon_api_key: '',
      client_hint: '',
      description: '',
      ozon_has_api_key: false,
      enterpriseId: enterprises[0]?.id || ''
    });
    setEditingApiKey(true);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        id: form.id || undefined,
        name: form.name,
        ozon_client_id: form.ozon_client_id,
        // Если поле пустое при редактировании — не отправляем, ключ останется прежним.
        ozon_api_key: form.id && !form.ozon_api_key ? undefined : form.ozon_api_key,
        client_hint: form.client_hint,
        description: form.description,
        enterpriseId: form.enterpriseId || null
      };
      const res = await fetch('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось сохранить продавца');
      }
      const updated = data.seller;
      setSellers((prev) => {
        const existing = prev.find((s) => s.id === updated.id);
        if (existing) {
          return prev.map((s) => (s.id === updated.id ? updated : s));
        }
        return [...prev, updated];
      });
      setSelectedId(updated.id);
      setForm(updated);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[admin/sellers] save error', e);
      setError(e?.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <Link href="/">
            <span
              style={{
                color: '#2563eb',
                cursor: 'pointer',
                marginRight: 8
              }}
            >
              ← Вернуться на главную
            </span>
          </Link>
          <span style={{ color: '#6b7280' }}>/ Магазины</span>
        </div>

        <h1>Магазины</h1>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          У вас нет прав на управление магазинами.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: 8, fontSize: 13 }}>
        <Link href="/">
          <span
            style={{
              color: '#2563eb',
              cursor: 'pointer',
              marginRight: 8
            }}
          >
            ← Вернуться на главную
          </span>
        </Link>
        <span style={{ color: '#6b7280' }}>/ Магазины</span>
      </div>

      <h1 style={{ marginBottom: 16 }}>Магазины</h1>

      <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        {loading && <span style={{ fontSize: 12, color: '#6b7280' }}>Загрузка…</span>}
        {error && <span style={{ fontSize: 12, color: '#b91c1c' }}>{error}</span>}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          flexWrap: 'wrap'
        }}
      >
        <div
          style={{
            minWidth: 260,
            maxWidth: 320,
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 12,
            background: '#f9fafb'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 8
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>Список</div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              style={{
                marginLeft: 'auto',
                padding: '4px 10px',
                borderRadius: 9999,
                border: 'none',
                backgroundColor: saving ? '#9ca3af' : '#16a34a',
                color: '#fff',
                fontSize: 12,
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              Новый магазин
            </button>
          </div>
          {sellers.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280' }}>Магазины не найдены</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {sellers.map((s) => (
                <li
                  key={s.id}
                  onClick={() => handleSelect(s)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    marginBottom: 4,
                    cursor: 'pointer',
                    backgroundColor: selectedId === s.id ? '#e5f3ff' : 'transparent',
                    border:
                      selectedId === s.id ? '1px solid #3b82f6' : '1px solid transparent',
                    fontSize: 12
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{s.name || `(id: ${s.id})`}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    Client ID: {s.ozon_client_id}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>
                    Enterprise: {s.enterpriseId || '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {form && (
          <div
            style={{
              flex: 1,
              minWidth: 320,
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 16
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              {form.id ? `Редактирование магазина ${form.id}` : 'Новый магазин'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 13 }}>
                Имя
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  style={{
                    marginTop: 4,
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #d1d5db'
                  }}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                OZON Client ID
                <input
                  type="text"
                  value={form.ozon_client_id || ''}
                  onChange={(e) => handleChange('ozon_client_id', e.target.value)}
                  style={{
                    marginTop: 4,
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #d1d5db'
                  }}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                OZON API Key
                {form.id && form.ozon_has_api_key && !editingApiKey && (
                  <span
                    style={{
                      display: 'block',
                      marginTop: 4,
                      fontSize: 12,
                      color: '#b91c1c',
                      fontWeight: 500
                    }}
                  >
                    Ключ сохранён. Поле с «*****» показывает факт наличия ключа.
                    Нажмите «Изменить ключ», чтобы задать новое значение.
                  </span>
                )}
                {form.id && form.ozon_has_api_key && !editingApiKey ? (
                  <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value="*****"
                      disabled
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: 13,
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        backgroundColor: '#f9fafb',
                        color: '#6b7280'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditingApiKey(true);
                        handleChange('ozon_api_key', '');
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 9999,
                        border: 'none',
                        backgroundColor: '#f97316',
                        color: '#fff',
                        fontSize: 12,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Изменить ключ
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={form.ozon_api_key || ''}
                    onChange={(e) => handleChange('ozon_api_key', e.target.value)}
                    style={{
                      marginTop: 4,
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: 13,
                      borderRadius: 6,
                      border: '1px solid #d1d5db'
                    }}
                  />
                )}
              </label>

              <label style={{ fontSize: 13 }}>
                Подпись (client_hint)
                <input
                  type="text"
                  value={form.client_hint || ''}
                  onChange={(e) => handleChange('client_hint', e.target.value)}
                  style={{
                    marginTop: 4,
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #d1d5db'
                  }}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                Описание
                <textarea
                  value={form.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={3}
                  style={{
                    marginTop: 4,
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 13,
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    resize: 'vertical'
                  }}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                Организация (Enterprise)
                {canEditEnterprise ? (
                  <select
                    value={form.enterpriseId || ''}
                    onChange={(e) => handleChange('enterpriseId', e.target.value)}
                    style={{
                      marginTop: 4,
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: 13,
                      borderRadius: 6,
                      border: '1px solid #d1d5db'
                    }}
                  >
                    <option value="">Не привязан</option>
                    {enterprises.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.name} ({ent.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={
                      form.enterpriseId
                        ? (() => {
                            const ent = enterprises.find((e) => e.id === form.enterpriseId);
                            return ent ? `${ent.name} (${ent.id})` : form.enterpriseId;
                          })()
                        : 'Не привязан'
                    }
                    style={{
                      marginTop: 4,
                      width: '100%',
                      padding: '6px 8px',
                      fontSize: 13,
                      borderRadius: 6,
                      border: '1px solid #d1d5db',
                      backgroundColor: '#f9fafb',
                      color: '#6b7280'
                    }}
                  />
                )}
              </label>
            </div>

            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 14px',
                  borderRadius: 9999,
                  border: 'none',
                  backgroundColor: saving ? '#6b7280' : '#2563eb',
                  color: '#fff',
                  fontSize: 13,
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

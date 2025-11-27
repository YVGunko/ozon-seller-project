import { useEffect, useState } from 'react';
import { useAccess } from '../../src/hooks/useAccess';

const modes = [
  { value: '', label: 'Все режимы' },
  { value: 'seo-name', label: 'SEO‑название' },
  { value: 'description', label: 'SEO‑описание' },
  { value: 'hashtags', label: 'Хештеги' },
  { value: 'rich', label: 'Rich JSON' },
  { value: 'slides', label: 'Слайды' },
  { value: 'custom', label: 'Custom' }
];

export default function AiPromptsPage() {
  const [prompts, setPrompts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [modeFilter, setModeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { canManagePrompts } = useAccess();

  useEffect(() => {
    if (!canManagePrompts) {
      setPrompts([]);
      setSelectedId(null);
      setSelectedPrompt(null);
      setError('У вас нет прав на управление AI‑промптами');
      setLoading(false);
      return;
    }

    const fetchPrompts = async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (modeFilter) params.set('mode', modeFilter);
        params.set('scope', 'global');
        const res = await fetch(`/api/ai/prompts?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Не удалось загрузить промпты');
        }
        const list = Array.isArray(data.prompts) ? data.prompts : [];
        setPrompts(list);
        if (list.length && !selectedId) {
          setSelectedId(list[0].id);
          setSelectedPrompt(list[0]);
        } else if (selectedId) {
          const found = list.find((p) => p.id === selectedId) || null;
          setSelectedPrompt(found);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[AI Prompts] load error', e);
        setError(e?.message || 'Ошибка загрузки промптов');
      } finally {
        setLoading(false);
      }
    };
    fetchPrompts();
  }, [modeFilter, canManagePrompts, selectedId]);

  const handleSelectPrompt = (prompt) => {
    setSelectedId(prompt.id);
    setSelectedPrompt(prompt);
  };

  const handleFieldChange = (field, value) => {
    setSelectedPrompt((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleCreate = async () => {
    // Базовые черновые шаблоны, чтобы API прошло валидацию
    const baseSystemTemplate =
      'Черновой system‑prompt для генерации контента. Отредактируйте этот текст под свои задачи.';
    const baseUserTemplate =
      'Черновой user‑prompt. Здесь можно использовать переменные товара, например {{product.name}} и {{product.offer_id}}.';

    setError('');
    setSaving(true);
    try {
      const mode = modeFilter || 'seo-name';
      const res = await fetch('/api/ai/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          scope: 'global',
          title: 'Новый промпт',
          description: '',
          systemTemplate: baseSystemTemplate,
          userTemplate: baseUserTemplate
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось создать промпт');
      }
      const created = data.prompt;
      setPrompts((prev) => [...prev, created]);
      setSelectedId(created.id);
      setSelectedPrompt(created);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AI Prompts] create error', e);
      setError(e?.message || 'Ошибка создания промпта');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPrompt) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/ai/prompts/${selectedPrompt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedPrompt.title,
          description: selectedPrompt.description,
          systemTemplate: selectedPrompt.systemTemplate,
          userTemplate: selectedPrompt.userTemplate,
          isDefault: Boolean(selectedPrompt.isDefault)
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось сохранить промпт');
      }
      const updated = data.prompt;
      setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setSelectedPrompt(updated);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AI Prompts] save error', e);
      setError(e?.message || 'Ошибка сохранения промпта');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPrompt) return;
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm('Удалить этот промпт? Его нельзя будет использовать в генерации.');
    if (!confirmed) return;

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/ai/prompts/${selectedPrompt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deletedAt: new Date().toISOString(),
          isDefault: false
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось удалить промпт');
      }

      setPrompts((prev) => prev.filter((p) => p.id !== selectedPrompt.id));
      const remaining = prompts.filter((p) => p.id !== selectedPrompt.id);
      if (remaining.length) {
        setSelectedId(remaining[0].id);
        setSelectedPrompt(remaining[0]);
      } else {
        setSelectedId(null);
        setSelectedPrompt(null);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AI Prompts] delete error', e);
      setError(e?.message || 'Ошибка удаления промпта');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ marginBottom: 16 }}>AI промпты</h1>

      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>
          Режим:
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            style={{ marginLeft: 8, padding: '4px 8px', fontSize: 13 }}
          >
            {modes.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {loading && <span style={{ fontSize: 12, color: '#6b7280' }}>Загрузка…</span>}
        {error && <span style={{ fontSize: 12, color: '#b91c1c' }}>{error}</span>}
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !canManagePrompts}
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            borderRadius: 9999,
            border: 'none',
            backgroundColor: saving || !canManagePrompts ? '#9ca3af' : '#16a34a',
            color: '#fff',
            fontSize: 12,
            cursor: saving || !canManagePrompts ? 'not-allowed' : 'pointer'
          }}
        >
          Создать промпт
        </button>
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
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Список промптов</div>
          {prompts.length === 0 ? (
            <div style={{ fontSize: 12, color: '#6b7280' }}>Промпты не найдены</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {prompts.map((p) => (
                <li
                  key={p.id}
                  onClick={() => handleSelectPrompt(p)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    marginBottom: 4,
                    cursor: 'pointer',
                    backgroundColor: selectedId === p.id ? '#e5f3ff' : 'transparent',
                    border:
                      selectedId === p.id ? '1px solid #3b82f6' : '1px solid transparent',
                    fontSize: 12
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{p.title || '(без названия)'}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    mode: {p.mode} {p.isDefault ? ' • дефолт' : ''}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>
                    обновлён:{' '}
                    {p.updatedAt
                      ? new Date(p.updatedAt).toLocaleString()
                      : new Date(p.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedPrompt && (
          <div
            style={{
              flex: 1,
              minWidth: 320,
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 16
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Редактирование промпта</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  mode: {selectedPrompt.mode} • id: {selectedPrompt.id}
                </div>
              </div>
              <label style={{ fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={Boolean(selectedPrompt.isDefault)}
                  onChange={(e) => handleFieldChange('isDefault', e.target.checked)}
                  style={{ marginRight: 4 }}
                />
                Сделать дефолтным
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ fontSize: 13 }}>
                Название
                <input
                  type="text"
                  value={selectedPrompt.title || ''}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
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
                  value={selectedPrompt.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  rows={2}
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
                System‑prompt
                <textarea
                  value={selectedPrompt.systemTemplate || ''}
                  onChange={(e) => handleFieldChange('systemTemplate', e.target.value)}
                  rows={12}
                  style={{
                    marginTop: 4,
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 12,
                    fontFamily: 'Menlo, ui-monospace, SFMono-Regular, monospace',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    resize: 'vertical'
                  }}
                />
              </label>

              <label style={{ fontSize: 13 }}>
                User‑prompt
                <textarea
                  value={selectedPrompt.userTemplate || ''}
                  onChange={(e) => handleFieldChange('userTemplate', e.target.value)}
                  rows={18}
                  style={{
                    marginTop: 4,
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 12,
                    fontFamily: 'Menlo, ui-monospace, SFMono-Regular, monospace',
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    resize: 'vertical'
                  }}
                />
              </label>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
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
                {saving ? 'Сохранение…' : 'Сохранить промпт'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || !selectedPrompt}
                style={{
                  padding: '8px 14px',
                  borderRadius: 9999,
                  border: '1px solid #fecaca',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  fontSize: 13,
                  cursor: saving || !selectedPrompt ? 'not-allowed' : 'pointer'
                }}
              >
                Удалить промпт
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

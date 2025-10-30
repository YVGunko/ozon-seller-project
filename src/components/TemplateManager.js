import React from 'react';
import useFieldTemplates from '../hooks/useFieldTemplates';

const TemplateManager = () => {
  const {
    fieldMappings,
    updateTemplate,
    toggleField,
    saveTemplates,
    reloadTemplates
  } = useFieldTemplates();

  const handleSave = async () => {
    const success = await saveTemplates();
    if (success) {
      alert('Шаблоны успешно сохранены!');
    } else {
      alert('Ошибка сохранения шаблонов!');
    }
  };

  return (
    <div className="template-manager">
      <div className="manager-header">
        <h2>Управление шаблонами полей</h2>
        <div className="manager-actions">
          <button onClick={reloadTemplates}>Обновить</button>
          <button onClick={handleSave}>Сохранить</button>
        </div>
      </div>

      <div className="templates-grid">
        {Object.entries(fieldMappings).map(([fieldKey, config]) => (
          <div key={fieldKey} className={`template-card ${!config.enabled ? 'disabled' : ''}`}>
            <div className="card-header">
              <h4>{config.name}</h4>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={() => toggleField(fieldKey)}
                />
                <span className="slider"></span>
              </label>
            </div>
            
            <div className="card-body">
              <textarea
                value={config.template}
                onChange={(e) => updateTemplate(fieldKey, e.target.value)}
                placeholder="Шаблон..."
                disabled={!config.enabled}
                rows={3}
              />
              
              <div className="template-info">
                {config.required && <span className="badge required">Обязательное</span>}
                {config.attributeId && (
                  <span className="badge attribute">Attribute ID: {config.attributeId}</span>
                )}
                <span className="field-key">Поле: {fieldKey}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TemplateManager;
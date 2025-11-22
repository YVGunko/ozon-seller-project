import { useEffect, useState, useMemo, useCallback } from 'react';

export function CategoryTypeSelector({
  disabled = false,
  value,
  onChange,
  tree = [],
  categoryMap,
  loading = false,
  error = ''
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const selectedLabel = useMemo(() => {
    if (!value || !value.categoryId || !value.typeId) return '';

    const categoryId = String(value.categoryId);
    const typeId = String(value.typeId);

    const category = categoryMap?.get(categoryId);
    const type = category?.types?.find((item) => String(item.id) === typeId);

    if (category && type) {
      return `${category.name} / ${type.name}`;
    }
    // Фолбэк, если дерево категорий ещё не загружено или не содержит нужные ID
    return `${categoryId} / ${typeId}`;
  }, [value, categoryMap]);

  const [expandedIds, setExpandedIds] = useState(new Set());
  const [pendingSelection, setPendingSelection] = useState({ 
    categoryId: '', 
    typeId: '' 
  });

  // Получаем текущую категорию из pendingSelection
  const currentCategory = useMemo(() => {
    if (!pendingSelection.categoryId) return null;
    return categoryMap?.get(pendingSelection.categoryId) || null;
  }, [categoryMap, pendingSelection.categoryId]);

  // Функция для поиска первого доступного элемента
  const findFirstAvailableSlot = useCallback((nodes = []) => {
    for (const node of nodes) {
      const actualNode = categoryMap?.get(node.id);
      if (actualNode?.types?.length) {
        const availableType = actualNode.types.find((type) => !type.disabled);
        if (availableType) {
          return {
            categoryId: actualNode.id,
            typeId: availableType.id
          };
        }
      }
      if (node.children?.length) {
        const result = findFirstAvailableSlot(node.children);
        if (result) return result;
      }
    }
    return null;
  }, [categoryMap]);

  // Инициализация при открытии модалки
  useEffect(() => {
    if (!modalOpen) return;

    if (value?.categoryId && value?.typeId) {
      setPendingSelection({
        categoryId: value.categoryId,
        typeId: value.typeId
      });
    } else {
      const initial = findFirstAvailableSlot(tree) || { 
        categoryId: '', 
        typeId: '' 
      };
      setPendingSelection(initial);
    }

    // Раскрываем корневые элементы
    const initialExpanded = new Set(tree.map(node => node.id));
    setExpandedIds(initialExpanded);
  }, [modalOpen, value, tree, findFirstAvailableSlot]);

  const handleCategorySelect = (categoryId) => {
    const category = categoryMap?.get(categoryId);
    if (!category || category.disabled) return;

    setPendingSelection(prev => ({
      categoryId,
      typeId: '' // Сбрасываем тип при смене категории
    }));

    // Автоматически выбираем первый доступный тип, если он есть
    if (category.types?.length) {
      const availableType = category.types.find(type => !type.disabled);
      if (availableType) {
        setTimeout(() => {
          setPendingSelection(prev => ({
            ...prev,
            typeId: availableType.id
          }));
        }, 0);
      }
    }
  };

  const handleTypeSelect = (typeId) => {
    const type = currentCategory?.types?.find(t => t.id === typeId);
    if (!type || type.disabled) return;

    setPendingSelection(prev => ({
      ...prev,
      typeId
    }));
  };

  const handleConfirmSelection = () => {
    if (pendingSelection.categoryId && pendingSelection.typeId) {
      onChange?.({
        categoryId: pendingSelection.categoryId,
        typeId: pendingSelection.typeId
      });
    }
    setModalOpen(false);
  };

  const toggleExpand = (nodeId) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setModalOpen(true)}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 9999,
          border: '1px solid #e2e8f0',
          backgroundColor: disabled ? '#f8fafc' : '#fff',
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: selectedLabel ? '#0f172a' : '#94a3b8'
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {selectedLabel || 'Выберите категорию и тип'}
        </span>
        <span
          style={{
            marginLeft: 8,
            flexShrink: 0,
            fontSize: 18,
            color: disabled ? '#cbd5f5' : '#94a3b8'
          }}
        >
          ›
        </span>
      </button>

      {loading && (
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
          Загрузка категорий…
        </div>
      )}
      
      {error && (
        <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>
          {error}
        </div>
      )}

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.5)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              width: 'min(900px, 95vw)',
              maxHeight: '90vh',
              backgroundColor: '#fff',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 15px 35px rgba(15,23,42,0.35)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: 16 }}>
                Выберите категорию и тип товара
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 16,
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                ✕
              </button>
            </div>

            {/* Основное содержимое */}
            <div style={{ display: 'flex', flex: 1, minHeight: 400 }}>
              {/* Левая панель - дерево категорий */}
              <div
                style={{
                  width: '40%',
                  borderRight: '1px solid #e2e8f0',
                  overflowY: 'auto'
                }}
              >
                <div style={{ padding: '8px 0' }}>
                  {tree.map((node) => (
                    <CategoryTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      expandedIds={expandedIds}
                      onToggleExpand={toggleExpand}
                      selectedCategoryId={pendingSelection.categoryId}
                      onSelect={handleCategorySelect}
                      categoryMap={categoryMap}
                    />
                  ))}
                </div>
              </div>

              {/* Правая панель - типы */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {currentCategory ? (
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: 12 }}>
                      Типы в «{currentCategory.name}»
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {currentCategory.types?.length ? (
                        currentCategory.types.map((type) => (
                          <button
                            key={type.id}
                            type="button"
                            disabled={type.disabled}
                            onClick={() => handleTypeSelect(type.id)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: 8,
                              border: '1px solid #cbd5f5',
                              backgroundColor:
                                pendingSelection.typeId === type.id
                                  ? '#eff6ff'
                                  : type.disabled
                                  ? '#f1f5f9'
                                  : '#fff',
                              color: type.disabled ? '#9ca3af' : '#0f172a',
                              cursor: type.disabled ? 'not-allowed' : 'pointer',
                              textAlign: 'left',
                              transition: 'all 0.2s'
                            }}
                          >
                            {type.name}
                            {type.disabled && ' (недоступен)'}
                          </button>
                        ))
                      ) : (
                        <div style={{ color: '#6b7280' }}>
                          В этой категории нет доступных типов
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#6b7280', textAlign: 'center', marginTop: 20 }}>
                    Выберите категорию слева
                  </div>
                )}
              </div>
            </div>

            {/* Футер с кнопками */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12
              }}
            >
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #cbd5f5',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!pendingSelection.categoryId || !pendingSelection.typeId}
                onClick={handleConfirmSelection}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor:
                    pendingSelection.categoryId && pendingSelection.typeId
                      ? '#2563eb'
                      : '#94a3b8',
                  color: '#fff',
                  cursor:
                    pendingSelection.categoryId && pendingSelection.typeId
                      ? 'pointer'
                      : 'not-allowed',
                  fontSize: 14
                }}
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Компонент узла дерева категорий
function CategoryTreeNode({
  node,
  depth,
  expandedIds,
  onToggleExpand,
  selectedCategoryId,
  onSelect,
  categoryMap
}) {
  const actualNode = categoryMap?.get(node.id);
  const hasChildren = node.children?.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedCategoryId === node.id;
  const isDisabled = actualNode?.disabled;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: depth * 16 + 12,
          minHeight: 32
        }}
      >
        {hasChildren && (
          <button
            type="button"
            onClick={() => onToggleExpand(node.id)}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              marginRight: 6,
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        )}
        
        {!hasChildren && (
          <span style={{ width: 20, marginRight: 6, display: 'inline-block' }} />
        )}

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          disabled={isDisabled}
          style={{
            flex: 1,
            textAlign: 'left',
            border: 'none',
            backgroundColor: isSelected ? '#eff6ff' : 'transparent',
            color: isDisabled ? '#9ca3af' : '#0f172a',
            padding: '6px 8px',
            borderRadius: 4,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            fontSize: 14,
            transition: 'all 0.2s'
          }}
        >
          {node.name}
          {isDisabled && ' (недоступна)'}
        </button>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              selectedCategoryId={selectedCategoryId}
              onSelect={onSelect}
              categoryMap={categoryMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ProfileManager } from '../src/utils/profileManager';
import { apiClient } from '../src/services/api-client';
import { useProductAttributes } from '../src/hooks/useProductAttributes';
import { getAttributeKey } from '../src/utils/attributesHelpers';
import {
  REQUIRED_BASE_FIELDS,
  BASE_FIELD_LABELS
} from '../src/constants/productFields';

const pageStyle = {
  fontFamily: 'Arial, sans-serif',
  padding: 20,
  maxWidth: 1200,
  margin: '0 auto'
};

const sectionStyle = {
  backgroundColor: '#f9fafb',
  padding: '16px 20px',
  borderRadius: 12,
  marginBottom: '18px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
};

const listStyle = {
  border: '1px solid #e1e5ee',
  borderRadius: 8,
  padding: 12,
  marginTop: 10,
  maxHeight: 200,
  overflowY: 'auto',
  backgroundColor: '#fff'
};

const textareaStyle = {
  width: '100%',
  minHeight: 120,
  borderRadius: 6,
  border: '1px solid #d1d5db',
  padding: '8px 10px',
  fontFamily: 'inherit'
};

const buttonStyle = {
  padding: '10px 18px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer'
};

const createReplacementId = () =>
  `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const tokenizeOffer = (value) => {
  if (!value) return [];
  const matches = value.match(/[A-Za-zА-Яа-я0-9]+|[^\sA-Za-zА-Яа-я0-9]+/g);
  if (!matches) return [value];
  return matches.map((token) => token.trim()).filter(Boolean);
};

const deriveReplacementRules = (sample, target) => {
  if (!sample || !target || sample === target) {
    return [
      {
        id: createReplacementId(),
        from: sample,
        to: target
      }
    ];
  }
  const sampleTokens = tokenizeOffer(sample);
  const targetTokens = tokenizeOffer(target);
  const length = Math.max(sampleTokens.length, targetTokens.length);
  const rules = [];
  for (let i = 0; i < length; i++) {
    const from = sampleTokens[i];
    const to = targetTokens[i];
    if (!from && to) {
      rules.push({
        id: createReplacementId(),
        from: '',
        to
      });
      continue;
    }
    if (from && !to) {
      rules.push({
        id: createReplacementId(),
        from,
        to: ''
      });
      continue;
    }
    if (from && to && from !== to) {
      rules.push({
        id: createReplacementId(),
        from,
        to
      });
    }
  }
  if (!rules.length) {
    rules.push({
      id: createReplacementId(),
      from: sample,
      to: target
    });
  }
  return rules;
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const applyReplacementsToText = (text, replacements = []) => {
  if (!text) return text;
  let result = String(text);
  replacements.forEach((replacement) => {
    const from = replacement.from ?? '';
    const to = replacement.to ?? '';
    if (!from) return;
    const pattern = new RegExp(escapeRegExp(from), 'gi');
    result = result.replace(pattern, to);
  });
  return result;
};

const stringifyAttributeValues = (attribute) => {
  if (!attribute) return '';
  const values = Array.isArray(attribute.values) ? attribute.values : [];
  return values
    .map((entry) => {
      if (!entry) return '';
      if (typeof entry === 'string') {
        return entry;
      }
      return (
        entry.value ??
        entry.text ??
        entry.value_text ??
        entry.name ??
        ''
      );
    })
    .filter(Boolean)
    .join(', ');
};

const transformAttributesWithReplacements = (
  attributes = [],
  replacements = [],
  attributeMetaMap = new Map()
) => {
  const nextAttributes = [];
  const diffs = [];

  attributes.forEach((attribute) => {
    const attrClone = JSON.parse(JSON.stringify(attribute));
    const attrKey = getAttributeKey(attribute?.id ?? attribute?.attribute_id) || '';
    const originalText = stringifyAttributeValues(attribute);

    if (Array.isArray(attrClone.values)) {
      attrClone.values = attrClone.values.map((entry) => {
        if (!entry) return entry;
        if (typeof entry === 'string') {
          const replaced = applyReplacementsToText(entry, replacements);
          return replaced !== entry ? { value: replaced } : entry;
        }
        const rawValue =
          entry.value ??
          entry.text ??
          entry.value_text ??
          entry.name ??
          '';
        if (!rawValue) {
          return entry;
        }
        const replaced = applyReplacementsToText(rawValue, replacements);
        if (replaced === rawValue) {
          return entry;
        }
        return {
          value: replaced
        };
      });
    }

    const nextText = stringifyAttributeValues(attrClone);
    if (originalText !== nextText) {
      const meta = attributeMetaMap.get(attrKey);
      diffs.push({
        attributeId: attrClone.id ?? attrClone.attribute_id ?? attrClone.attributeId,
        label: meta?.name || attribute.name || `ID ${attrKey || '—'}`,
        from: originalText,
        to: nextText
      });
    }
    nextAttributes.push(attrClone);
  });

  return { nextAttributes, diffs };
};

const ClonerOfferList = ({ offers, onRemove }) => {
  if (!offers.length) {
    return (
      <div style={{ color: '#6b7280', fontSize: 14 }}>
        Добавьте хотя бы один артикул (каждый с новой строки).
      </div>
    );
  }

  return (
    <ul style={listStyle}>
      {offers.map((offer) => (
        <li
          key={offer}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            borderBottom: '1px solid #f3f4f6'
          }}
        >
          <span style={{ fontWeight: 'bold' }}>{offer}</span>
          <button
            type="button"
            onClick={() => onRemove(offer)}
            style={{
              ...buttonStyle,
              backgroundColor: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca'
            }}
          >
            Удалить
          </button>
        </li>
      ))}
    </ul>
  );
};

export default function ProductClonerPage() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [sampleOffer, setSampleOffer] = useState('');
  const [sampleAttributes, setSampleAttributes] = useState(null);
  const [sampleError, setSampleError] = useState('');
  const [loadingSample, setLoadingSample] = useState(false);
  const [offersInput, setOffersInput] = useState('');
  const [targetOffers, setTargetOffers] = useState([]);
  const [rules, setRules] = useState([]);
  const [rulesExplanationVisible, setRulesExplanationVisible] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [previewError, setPreviewError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState({ message: '', error: '' });

  useEffect(() => {
    const profile = ProfileManager.getCurrentProfile();
    setCurrentProfile(profile);
  }, []);

  const { loadAttributes } = useProductAttributes(apiClient, currentProfile);

  const handleLoadSample = async () => {
    if (!currentProfile) {
      alert('Пожалуйста, выберите профиль на главной странице.');
      return;
    }
    if (!sampleOffer.trim()) {
      setSampleError('Введите артикул образца');
      return;
    }
    setSampleError('');
    setLoadingSample(true);
    setSampleAttributes(null);
    try {
      const trimmedOffer = sampleOffer.trim();
      const result = await loadAttributes(trimmedOffer);
      const product =
        (result?.response?.result && result.response.result[0]) ||
        (result?.editable && result.editable[0]) ||
        null;
      if (!product) {
        setSampleError('Товар не найден');
      } else {
        try {
          const infoParams = new URLSearchParams({
            offer_id: trimmedOffer,
            profileId: currentProfile.id
          });
          const infoResponse = await fetch(`/api/products/info-list?${infoParams.toString()}`);
          if (infoResponse.ok) {
            const infoData = await infoResponse.json();
            const infoItem =
              (Array.isArray(infoData?.items) && infoData.items[0]) ||
              (Array.isArray(infoData?.raw?.items) && infoData.raw.items[0]) ||
              null;
            if (infoItem) {
              product.price = infoItem.price ?? infoItem.price_value ?? product.price;
              product.old_price = infoItem.old_price ?? infoItem.old_price_value ?? product.old_price;
              product.min_price = infoItem.min_price ?? infoItem.min_price_value ?? product.min_price;
              product.depth =
                infoItem.depth ?? infoItem.length ?? infoItem.package_dimensions?.length ?? product.depth;
              product.width = infoItem.width ?? infoItem.package_dimensions?.width ?? product.width;
              product.height = infoItem.height ?? infoItem.package_dimensions?.height ?? product.height;
              product.dimension_unit =
                infoItem.dimension_unit ??
                infoItem.package_dimensions?.dimension_unit ??
                product.dimension_unit;
              product.weight =
                infoItem.weight ?? infoItem.package_weight ?? product.weight;
              product.weight_unit =
                infoItem.weight_unit ?? infoItem.package_weight_unit ?? product.weight_unit;
              product.description_category_id =
                infoItem.description_category_id ?? product.description_category_id;
            }
          }
        } catch (infoError) {
          console.error('Failed to fetch info-list for sample', infoError);
        }
        setSampleAttributes(product);
      }
    } catch (err) {
      console.error('Failed to load sample product', err);
      setSampleError(err.message || 'Не удалось загрузить образец');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleOffersParse = () => {
    const lines = offersInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const unique = Array.from(new Set(lines));
    setTargetOffers(unique);
  };

  const handleRemoveOffer = (offerId) => {
    setTargetOffers((prev) => prev.filter((offer) => offer !== offerId));
  };

  useEffect(() => {
    const trimmedSample = sampleOffer.trim();
    if (!trimmedSample || targetOffers.length === 0) {
      setRules([]);
      return;
    }
    setRules((prevRules) => {
      const relevantPrev = prevRules.filter((rule) =>
        targetOffers.includes(rule.target)
      );
      const nextRules = targetOffers.map((target) => {
        const prev = relevantPrev.find(
          (rule) => rule.target === target && rule.sample === trimmedSample
        );
        if (prev) {
          return prev;
        }
        return {
          sample: trimmedSample,
          target,
          replacements: deriveReplacementRules(trimmedSample, target)
        };
      });
      return nextRules;
    });
  }, [sampleOffer, targetOffers]);

  const handleReplacementFieldChange = (target, replacementId, field, value) => {
    setRules((prevRules) =>
      prevRules.map((rule) => {
        if (rule.target !== target) return rule;
        return {
          ...rule,
          replacements: rule.replacements.map((replacement) =>
            replacement.id === replacementId
              ? {
                  ...replacement,
                  [field]: value
                }
              : replacement
          )
        };
      })
    );
  };

  const handleAddReplacement = (target) => {
    setRules((prevRules) =>
      prevRules.map((rule) => {
        if (rule.target !== target) return rule;
        return {
          ...rule,
          replacements: [
            ...rule.replacements,
            {
              id: createReplacementId(),
              from: '',
              to: ''
            }
          ]
        };
      })
    );
  };

  const handleGeneratePreview = () => {
    if (!sampleAttributes) {
      setPreviewError('Сначала загрузите товар-образец.');
      setPreviewItems([]);
      return;
    }
    if (rules.length === 0) {
      setPreviewError('Добавьте хотя бы один артикул для клонирования.');
      setPreviewItems([]);
      return;
    }
    const baseName = sampleAttributes.name || '';
    const baseDescription = sampleAttributes.description || '';
    const baseOfferId = sampleAttributes.offer_id || '';
    const attributeMetaMap = new Map(
      (sampleAttributes.available_attributes || []).map((meta) => [
        getAttributeKey(meta?.id ?? meta?.attribute_id) || '',
        meta
      ])
    );
    const sourceAttributes = Array.isArray(sampleAttributes.attributes)
      ? sampleAttributes.attributes
      : [];
    const nextPreview = rules.map((rule) => {
      const replacements = (rule.replacements || []).filter(
        (replacement) => replacement.from || replacement.to
      );
      const appliedName = applyReplacementsToText(baseName, replacements);
      const appliedDescription = applyReplacementsToText(baseDescription, replacements);
      const appliedOffer = replacements.length
        ? applyReplacementsToText(baseOfferId, replacements)
        : rule.target;
      const { nextAttributes, diffs } = transformAttributesWithReplacements(
        sourceAttributes,
        replacements,
        attributeMetaMap
      );
      const nextProductPayload = JSON.parse(JSON.stringify(sampleAttributes));
      nextProductPayload.offer_id = appliedOffer || rule.target;
      nextProductPayload.name = appliedName || rule.target;
      nextProductPayload.description = appliedDescription;
      nextProductPayload.attributes = nextAttributes;

      return {
        target: rule.target,
        offer_id: appliedOffer || rule.target,
        name: appliedName || rule.target,
        description: appliedDescription,
        replacements,
        attributeDiffs: diffs,
        productPayload: nextProductPayload
      };
    });
    setPreviewItems(nextPreview);
    setPreviewError('');
  };

  const handleImport = async () => {
    if (!currentProfile) {
      alert('Профиль OZON не выбран.');
      return;
    }
    if (previewItems.length === 0) {
      alert('Сначала сформируйте предпросмотр.');
      return;
    }
    let items = [];
    try {
      items = previewItems.map((item) => {
        const clone = JSON.parse(JSON.stringify(item.productPayload));
        delete clone.product_id;
        delete clone.productId;
        delete clone.id;
        delete clone.sku;
        delete clone.barcode;
        delete clone.barcodes;
        REQUIRED_BASE_FIELDS.forEach((field) => {
          const value = clone[field];
          clone[field] = value !== undefined && value !== null ? String(value) : '';
          if (!clone[field]) {
            throw new Error(
              `Поле ${BASE_FIELD_LABELS[field] || field} не заполнено для товара ${item.offer_id}`
            );
          }
        });
        clone.attributes = (clone.attributes || []).map((attr) => ({
          id: Number(attr?.id ?? attr?.attribute_id ?? attr?.attributeId),
          values: attr.values
        }));
        return clone;
      });
    } catch (validationError) {
      setImportStatus({
        message: '',
        error: validationError.message || 'Заполните обязательные поля'
      });
      return;
    }

    setImporting(true);
    setImportStatus({ message: 'Отправляем товары…', error: '' });
    try {
      const response = await fetch('/api/products/attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          profileId: currentProfile.id,
          mode: 'import'
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка при импорте');
      }
      if (data?.status_check?.error) {
        setImportStatus({ message: '', error: data.status_check.error });
      } else {
        setImportStatus({
          message:
            data?.status_check?.message ||
            'Импорт отправлен. Статус появится в логах.',
          error: ''
        });
      }
    } catch (error) {
      console.error('Cloner import error', error);
      setImportStatus({
        message: '',
        error: error.message || 'Не удалось отправить товары'
      });
    } finally {
      setImporting(false);
    }
  };

  const handleRemoveReplacement = (target, replacementId) => {
    setRules((prevRules) =>
      prevRules.map((rule) => {
        if (rule.target !== target) return rule;
        return {
          ...rule,
          replacements: rule.replacements.filter(
            (replacement) => replacement.id !== replacementId
          )
        };
      })
    );
  };

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" legacyBehavior>
          <a style={{ color: '#0070f3', textDecoration: 'none', fontSize: 14 }}>
            ← На главную
          </a>
        </Link>
      </div>

      <h1 style={{ marginBottom: 10 }}>Клонирование товаров</h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>
        Создавайте новые товары на базе образца, массово заменяя отличающиеся части артикула и
        описания. Полезно для серий с одинаковыми характеристиками.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>1. Выбор образца</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          Найдите товар, который будет служить эталоном для остальных. Мы подгрузим его атрибуты и
          изображения.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Например, Viper 75W H7"
            value={sampleOffer}
            onChange={(e) => setSampleOffer(e.target.value)}
            style={{ flex: '1 1 240px', padding: 8, borderRadius: 6, border: '1px solid #d1d5db' }}
          />
          <button
            type="button"
            onClick={handleLoadSample}
            disabled={!sampleOffer.trim() || loadingSample}
            style={{
              ...buttonStyle,
              backgroundColor: '#3b82f6',
              color: '#fff',
              minWidth: 160
            }}
          >
            {loadingSample ? 'Загружаем…' : 'Загрузить образец'}
          </button>
        </div>
        {sampleError && (
          <div style={{ color: '#b91c1c', fontSize: 14, marginBottom: 10 }}>{sampleError}</div>
        )}
        {sampleAttributes && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              backgroundColor: '#f8fafc'
            }}
          >
            <div style={{ fontWeight: 'bold' }}>Выбранный образец:</div>
            <div>Артикул: {sampleAttributes.offer_id}</div>
            <div>Название: {sampleAttributes.name}</div>
            <div>ID на OZON: {sampleAttributes.id}</div>
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>2. Перечень новых артикулов</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          Введите каждый offer_id с новой строки. Мы построим правила замены автоматически (их можно
          будет корректировать дальше).
        </p>
        <textarea
          placeholder={'Viper 75W H7\nViper 75W H1\nViper 75W H4'}
          value={offersInput}
          onChange={(e) => setOffersInput(e.target.value)}
          style={textareaStyle}
        />
        <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handleOffersParse}
            style={{
              ...buttonStyle,
              backgroundColor: '#10b981',
              color: '#fff'
            }}
          >
            Разобрать список
          </button>
          <button
            type="button"
            onClick={() => {
              setOffersInput('');
              setTargetOffers([]);
            }}
            style={{
              ...buttonStyle,
              backgroundColor: '#f3f4f6',
              color: '#111827'
            }}
          >
            Очистить
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          <strong>Найдено: {targetOffers.length} артикулов</strong>
        </div>
        <ClonerOfferList offers={targetOffers} onRemove={handleRemoveOffer} />
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>3. Правила замены</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          На основе образца и списка артикулов будут построены правила (например, H7 → H4, 75W →
          130W). Правила применяются к атрибутам, названиям, описаниям и offer_id.
        </p>
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 8,
            border: '1px solid #d1d5db',
            backgroundColor: '#fff'
          }}
        >
          {rules.length === 0 ? (
            <div style={{ color: '#6b7280' }}>
              Добавьте образец и список артикулов, чтобы увидеть сгенерированные правила.
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 16 }}>
                <strong>Сгенерировано групп: {rules.length}</strong>
              </div>
              {rules.map((rule) => (
                <div
                  key={rule.target}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: 6 }}>{rule.target}</div>
                  {rule.replacements.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                      Различий не найдено. Можно добавить правила вручную.
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
                      Автоматически найдены {rule.replacements.length} различий.
                    </div>
                  )}
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 14,
                      marginBottom: 8
                    }}
                  >
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb' }}>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '6px',
                            borderBottom: '1px solid #e5e7eb'
                          }}
                        >
                          Что заменить
                        </th>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '6px',
                            borderBottom: '1px solid #e5e7eb'
                          }}
                        >
                          На что заменить
                        </th>
                        <th style={{ width: 80 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {rule.replacements.map((replacement) => (
                        <tr key={replacement.id}>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6' }}>
                            <input
                              type="text"
                              value={replacement.from}
                              onChange={(e) =>
                                handleReplacementFieldChange(
                                  rule.target,
                                  replacement.id,
                                  'from',
                                  e.target.value
                                )
                              }
                              placeholder="Например, H7"
                              style={{
                                width: '100%',
                                padding: 6,
                                borderRadius: 6,
                                border: '1px solid #d1d5db'
                              }}
                            />
                          </td>
                          <td style={{ padding: '6px', borderBottom: '1px solid #f3f4f6' }}>
                            <input
                              type="text"
                              value={replacement.to}
                              onChange={(e) =>
                                handleReplacementFieldChange(
                                  rule.target,
                                  replacement.id,
                                  'to',
                                  e.target.value
                                )
                              }
                              placeholder="Например, H4"
                              style={{
                                width: '100%',
                                padding: 6,
                                borderRadius: 6,
                                border: '1px solid #d1d5db'
                              }}
                            />
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveReplacement(rule.target, replacement.id)}
                              style={{
                                ...buttonStyle,
                                backgroundColor: '#fee2e2',
                                color: '#b91c1c'
                              }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    type="button"
                    onClick={() => handleAddReplacement(rule.target)}
                    style={{
                      ...buttonStyle,
                      backgroundColor: '#f3f4f6',
                      color: '#111827'
                    }}
                  >
                    Добавить правило
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRulesExplanationVisible((prev) => !prev)}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#f3f4f6',
                  color: '#111827'
                }}
              >
                {rulesExplanationVisible ? 'Скрыть пояснение' : 'Как формируются правила?'}
              </button>
              {rulesExplanationVisible && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 6,
                    backgroundColor: '#eef2ff',
                    color: '#312e81',
                    fontSize: 13
                  }}
                >
                  Мы разбиваем артикулы на части (слова, числа, символы) и сравниваем их. Там, где
                  части различаются, формируется правило: «что заменить» → «на что заменить». Эти
                  правила можно редактировать вручную и добавлять новые.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>4. Предпросмотр</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          На основании правил мы подготовим черновик каждого товара. Проверяйте названия,
          описания и артикулы до отправки в OZON.
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            onClick={handleGeneratePreview}
            disabled={!sampleAttributes || rules.length === 0}
            style={{
              ...buttonStyle,
              backgroundColor: !sampleAttributes || rules.length === 0 ? '#d1d5db' : '#2563eb',
              color: '#fff'
            }}
          >
            Сформировать предпросмотр
          </button>
          <button
            type="button"
            onClick={() => {
              setPreviewItems([]);
              setPreviewError('');
            }}
            style={{
              ...buttonStyle,
              backgroundColor: '#f3f4f6',
              color: '#111827'
            }}
          >
            Очистить предпросмотр
          </button>
        </div>
        {previewError && (
          <div style={{ color: '#b91c1c', fontSize: 14, marginBottom: 10 }}>{previewError}</div>
        )}
        {previewItems.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12
            }}
          >
            {previewItems.map((item) => (
              <div
                key={item.target}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 12,
                  backgroundColor: '#fff'
                }}
              >
                <div style={{ fontSize: 13, color: '#6b7280' }}>Артикул</div>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{item.offer_id}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Название</div>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{item.name}</div>
                {item.replacements.length > 0 && (
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    Правила:
                    <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
                      {item.replacements.map((replacement) => (
                        <li key={replacement.id}>
                          «{replacement.from || '∅'}» → «{replacement.to || '∅'}»
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.attributeDiffs && item.attributeDiffs.length > 0 && (
                  <div style={{ fontSize: 13, color: '#374151', marginTop: 8 }}>
                    Изменённые характеристики:
                    <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
                      {item.attributeDiffs.map((diff, index) => (
                        <li key={`${diff.attributeId || index}-${diff.label}`}>
                          <strong>{diff.label}</strong>: «{diff.from || '—'}» → «{diff.to || '—'}»
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#6b7280', fontSize: 14 }}>
            Здесь появится предпросмотр новых товаров.
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px' }}>5. Импорт в OZON</h2>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          На финальном шаге соберём JSON и отправим в <code>/v3/product/import</code>. Сначала
          убедитесь, что предпросмотр корректный.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleImport}
            disabled={previewItems.length === 0 || importing}
            style={{
              ...buttonStyle,
              minWidth: 240,
              backgroundColor:
                previewItems.length === 0 || importing ? '#d1d5db' : '#059669',
              color: '#fff',
              cursor:
                previewItems.length === 0 || importing ? 'not-allowed' : 'pointer'
            }}
          >
            {importing ? 'Отправляем…' : 'Импортировать в OZON'}
          </button>
          {importStatus.message && (
            <span style={{ color: '#047857', fontSize: 14 }}>
              {importStatus.message}
            </span>
          )}
          {importStatus.error && (
            <span style={{ color: '#b91c1c', fontSize: 14 }}>
              {importStatus.error}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

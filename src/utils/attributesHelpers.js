export const LARGE_TEXT_ATTRIBUTE_IDS = new Set(['4191', '7206', '22232', '4180']);
export const TYPE_ATTRIBUTE_ID = '8229';
export const TYPE_ATTRIBUTE_NUMERIC = Number(TYPE_ATTRIBUTE_ID);
export const SINGLE_VALUE_STRING_ATTRIBUTE_IDS = new Set(['23171']);

export const parsePositiveTypeId = (rawValue) => {
  if (rawValue === undefined || rawValue === null) return null;
  if (typeof rawValue === 'string' && rawValue.trim() === '') return null;
  const num = Number(rawValue);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
};

export const getAttributeKey = (value) => {
  if (value === undefined || value === null) return null;
  return String(value);
};

export const attributeHasValues = (attribute) => {
  if (!attribute || !Array.isArray(attribute.values)) return false;
  return attribute.values.some((valueEntry) => {
    const raw =
      valueEntry?.value ??
      valueEntry?.text ??
      valueEntry?.value_text ??
      '';
    return String(raw || '').trim().length > 0;
  });
};

export const createTypeAttributeValue = (typeValue) => {
  if (typeValue === undefined || typeValue === null) return null;
  const str = String(typeValue).trim();
  if (!str) return null;

  const numericValue = Number(str);
  return {
    value: str,
    dictionary_value_id: Number.isFinite(numericValue) ? numericValue : undefined
  };
};

export const normalizeProductAttributes = (products = []) => {
  return products.map((product) => {
    const availableAttributes = Array.isArray(product?.available_attributes)
      ? product.available_attributes
      : [];
    const existingAttributes = Array.isArray(product?.attributes)
      ? product.attributes
      : [];
    const usedAttributeKeys = new Set();

    const mergedAttributes = availableAttributes
      .map((meta) => {
        const attrKey = getAttributeKey(meta?.id ?? meta?.attribute_id);
        if (!attrKey) return null;

        const existingMatch = existingAttributes.find(
          (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
        );

        if (existingMatch) {
          usedAttributeKeys.add(attrKey);
          return {
            ...existingMatch,
            id: existingMatch.id ?? existingMatch.attribute_id ?? attrKey
          };
        }

        return {
          id: meta.id ?? attrKey,
          values: []
        };
      })
      .filter(Boolean);

    existingAttributes.forEach((attr) => {
      const attrKey = getAttributeKey(attr?.id ?? attr?.attribute_id);
      if (!attrKey || usedAttributeKeys.has(attrKey)) return;

      mergedAttributes.push({
        ...attr,
        id: attr.id ?? attr.attribute_id ?? attrKey
      });
    });

    const syncedAttributes = syncTypeAttributeWithTypeId(mergedAttributes, product?.type_id);

    return {
      ...product,
      attributes: syncedAttributes
    };
  });
};

export const syncTypeAttributeWithTypeId = (attributes = [], typeIdValue, options = {}) => {
  const { force = false } = options;
  const attrKey = TYPE_ATTRIBUTE_ID;

  const normalizedAttributes = Array.isArray(attributes)
    ? attributes.map((attr) => ({ ...attr }))
    : [];

  const attrIndex = normalizedAttributes.findIndex(
    (attr) => getAttributeKey(attr?.id ?? attr?.attribute_id) === attrKey
  );

  const typeAttributeValue = createTypeAttributeValue(typeIdValue);

  if (attrIndex === -1) {
    if (!typeAttributeValue) {
      return normalizedAttributes;
    }

    return [
      {
        id: TYPE_ATTRIBUTE_NUMERIC,
        values: [typeAttributeValue],
        __from_type_id: true
      },
      ...normalizedAttributes
    ];
  }

  const currentAttribute = normalizedAttributes[attrIndex];
  const hasOwnValue = attributeHasValues(currentAttribute);

  if (!force && hasOwnValue) {
    return normalizedAttributes;
  }

  normalizedAttributes[attrIndex] = {
    ...currentAttribute,
    values: typeAttributeValue ? [typeAttributeValue] : [],
    __from_type_id: true
  };

  return normalizedAttributes;
};

export const formatAttributeValues = (values = []) => {
  return values
    .map((entry) => entry?.value ?? entry?.text ?? entry?.value_text ?? '')
    .filter(Boolean)
    .join('\n');
};

export const parseAttributeInput = (rawValue = '', attributeId = null) => {
  if (rawValue === undefined || rawValue === null) return [];
  const attrKey = attributeId !== null ? String(attributeId) : null;
  const normalizedValue = String(rawValue);

  if (attrKey && SINGLE_VALUE_STRING_ATTRIBUTE_IDS.has(attrKey)) {
    const singleLineValue = normalizedValue
      .replace(/[\r\n]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .join(' ')
      .trim();
    return singleLineValue ? [{ value: singleLineValue }] : [];
  }

  return normalizedValue
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({ value }));
};

export const getDictionaryOptionKey = (option) => {
  if (!option) return null;
  const raw =
    option?.dictionary_value_id ??
    option?.value_id ??
    option?.id ??
    option?.value ??
    option?.text;
  if (raw === undefined || raw === null || raw === '') return null;
  return String(raw);
};

export const getDictionaryOptionLabel = (option) => {
  if (!option) return '';
  return (
    option?.value ??
    option?.text ??
    option?.title ??
    option?.name ??
    option?.label ??
    (option?.dictionary_value_id ? `ID ${option.dictionary_value_id}` : '')
  );
};

export const buildDictionaryValueEntry = (option) => {
  const key = getDictionaryOptionKey(option);
  if (!key) return null;
  const label = getDictionaryOptionLabel(option) || key;
  const numericId = Number(key);
  const entry = {
    value: label
  };
  if (!Number.isNaN(numericId)) {
    entry.dictionary_value_id = numericId;
  } else if (
    option?.dictionary_value_id !== undefined &&
    option?.dictionary_value_id !== null
  ) {
    entry.dictionary_value_id = option.dictionary_value_id;
  }
  return entry;
};

export const getDictionaryValueEntryKey = (entry, dictionaryOptionMap) => {
  if (!entry) return null;
  const rawId =
    entry?.dictionary_value_id ??
    entry?.dictionaryValueId ??
    entry?.value_id ??
    entry?.id;
  if (rawId !== undefined && rawId !== null && rawId !== '') {
    return String(rawId);
  }

  const label =
    entry?.value ??
    entry?.text ??
    entry?.value_text ??
    '';
  if (!label || !dictionaryOptionMap || dictionaryOptionMap.size === 0) {
    return null;
  }

  for (const [key, option] of dictionaryOptionMap.entries()) {
    if (getDictionaryOptionLabel(option) === label) {
      return key;
    }
  }
  return null;
};

export const isDictionaryValueEntry = (entry) => {
  if (!entry) return false;
  const rawId =
    entry?.dictionary_value_id ??
    entry?.dictionaryValueId ??
    entry?.value_id ??
    entry?.id;
  return rawId !== undefined && rawId !== null && String(rawId).trim() !== '';
};

export const normalizeAttributeValues = (values = []) => {
  return values
    .map((valueEntry) => {
      const rawValue =
        valueEntry?.value ??
        valueEntry?.text ??
        valueEntry?.value_text ??
        valueEntry;
      if (rawValue === undefined || rawValue === null) return null;
      const str = String(rawValue).trim();
      if (!str) return null;

      const dictionaryId =
        valueEntry?.dictionary_value_id ??
        valueEntry?.dictionaryValueId ??
        valueEntry?.value_id ??
        null;

      const payload = { value: str };
      if (
        dictionaryId !== null &&
        dictionaryId !== undefined &&
        String(dictionaryId).trim() !== ''
      ) {
        const numericId = Number(dictionaryId);
        payload.dictionary_value_id = Number.isFinite(numericId) ? numericId : dictionaryId;
      }
      return payload;
    })
    .filter(Boolean);
};

export const areAttributeValuesEqual = (nextValues = [], originalValues = []) => {
  if (nextValues.length !== originalValues.length) return false;
  return nextValues.every((value, idx) => {
    const original = originalValues[idx];
    if (!original) return false;
    const sameValue = value.value === original.value;
    const nextDict = value.dictionary_value_id ?? null;
    const originalDict = original.dictionary_value_id ?? null;
    return sameValue && String(nextDict ?? '') === String(originalDict ?? '');
  });
};


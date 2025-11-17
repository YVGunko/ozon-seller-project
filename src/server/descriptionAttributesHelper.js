const DEFAULT_LANGUAGE = 'DEFAULT';

const buildDescriptionAttributeKey = (descriptionCategoryId, typeId) => {
  return `${descriptionCategoryId ?? 'none'}:${typeId ?? 'none'}`;
};

const getAttributeValueLabel = (valueEntry) => {
  if (!valueEntry) return '';
  return (
    valueEntry?.value ??
    valueEntry?.text ??
    valueEntry?.value_text ??
    ''
  );
};

const getAttributeValueDictionaryId = (valueEntry) => {
  if (!valueEntry) return null;
  const raw =
    valueEntry?.dictionary_value_id ??
    valueEntry?.dictionaryValueId ??
    valueEntry?.value_id ??
    valueEntry?.id;
  if (raw === undefined || raw === null) return null;
  return String(raw);
};

const collectAttributeValues = (products = [], attributeId) => {
  const collected = [];
  const targetId = attributeId ? String(attributeId) : null;

  if (!targetId) return collected;

  products.forEach((product) => {
    (product?.attributes || []).forEach((attr) => {
      const attrId = attr?.id ?? attr?.attribute_id;
      if (String(attrId) === targetId) {
        (attr?.values || []).forEach((valueEntry) => {
          collected.push(valueEntry);
        });
      }
    });
  });

  return collected;
};

const mapDictionaryValues = (values = []) => {
  return values
    .map(
      (option) =>
        option?.dictionary_value_id ??
        option?.value_id ??
        option?.id
    )
    .filter((val) => val !== undefined && val !== null)
    .map(String);
};

async function enrichAttributeMeta({ ozon, attributeMeta, combo, productsInCombo, language }) {
  const attributeId = attributeMeta?.id ?? attributeMeta?.attribute_id;
  const hasDictionary = attributeMeta?.dictionary_id;

  if (!attributeId || !hasDictionary) {
    return attributeMeta;
  }

  const attributeValues = collectAttributeValues(productsInCombo, attributeId);

  try {
    const dictionaryResponse = await ozon.getAttributeDictionaryValues({
      attribute_id: attributeId,
      description_category_id: combo.descriptionCategoryId,
      language,
      last_value_id: 0,
      limit: 100,
      type_id: combo.typeId
    });

    let dictionaryValues = Array.isArray(dictionaryResponse?.result)
      ? dictionaryResponse.result
      : [];
    const dictionaryValueIds = new Set(mapDictionaryValues(dictionaryValues));

    const searchPromises = [];
    const seenSearchLabels = new Set();

    attributeValues.forEach((valueEntry) => {
      const label = getAttributeValueLabel(valueEntry);
      const dictionaryId = getAttributeValueDictionaryId(valueEntry);
      if (dictionaryId && !dictionaryValueIds.has(dictionaryId)) {
        if (label && !seenSearchLabels.has(label)) {
          seenSearchLabels.add(label);
          searchPromises.push(
            ozon
              .searchAttributeDictionaryValues({
                attribute_id: attributeId,
                description_category_id: combo.descriptionCategoryId,
                type_id: combo.typeId,
                language,
                limit: 50,
                value: label
              })
              .then((searchResponse) => {
                const searchResults = Array.isArray(searchResponse?.result)
                  ? searchResponse.result
                  : [];
                return searchResults;
              })
              .catch((searchError) => {
                console.error('Failed to search dictionary values', {
                  attributeId,
                  descriptionCategoryId: combo.descriptionCategoryId,
                  typeId: combo.typeId,
                  value: label,
                  message: searchError?.message || searchError
                });
                return [];
              })
          );
        }
      }
    });

    if (searchPromises.length) {
      const searchResultsList = await Promise.all(searchPromises);
      searchResultsList.forEach((searchResults) => {
        searchResults.forEach((option) => {
          const optionId =
            option?.dictionary_value_id ??
            option?.value_id ??
            option?.id;
          if (optionId !== undefined && optionId !== null) {
            const idStr = String(optionId);
            if (!dictionaryValueIds.has(idStr)) {
              dictionaryValueIds.add(idStr);
              dictionaryValues.push(option);
            }
          }
        });
      });
    }

    return {
      ...attributeMeta,
      dictionary_values: dictionaryValues
    };
  } catch (dictionaryError) {
    console.error('Failed to fetch dictionary values', {
      attributeId,
      descriptionCategoryId: combo.descriptionCategoryId,
      typeId: combo.typeId,
      message: dictionaryError?.message || dictionaryError
    });
    return attributeMeta;
  }
}

async function fetchComboAttributes({ ozon, combo, productsInCombo, language }) {
  try {
    const attributesResponse = await ozon.getDescriptionCategoryAttributes(
      combo.descriptionCategoryId,
      combo.typeId,
      language
    );

    const attributesList = Array.isArray(attributesResponse?.result)
      ? attributesResponse.result
      : [];

    const enrichedAttributes = await Promise.all(
      attributesList.map((attributeMeta) =>
        enrichAttributeMeta({
          ozon,
          attributeMeta,
          combo,
          productsInCombo,
          language
        })
      )
    );

    return enrichedAttributes;
  } catch (metaError) {
    console.error('Failed to fetch description-category attributes', {
      descriptionCategoryId: combo.descriptionCategoryId,
      typeId: combo.typeId,
      message: metaError?.message || metaError
    });
    return [];
  }
}

export async function enrichProductsWithDescriptionAttributes({
  ozon,
  products = [],
  language = DEFAULT_LANGUAGE
}) {
  if (!Array.isArray(products) || products.length === 0) {
    return { products: [], metaByCombo: {} };
  }

  const combos = new Map();
  const productsByCombo = new Map();

  products.forEach((product) => {
    const descriptionCategoryId =
      product?.description_category_id ?? product?.descriptionCategoryId;
    const typeId = product?.type_id ?? product?.typeId;

    if (!descriptionCategoryId || !typeId) {
      return;
    }

    const key = buildDescriptionAttributeKey(descriptionCategoryId, typeId);
    if (!combos.has(key)) {
      combos.set(key, { descriptionCategoryId, typeId });
    }
    if (!productsByCombo.has(key)) {
      productsByCombo.set(key, []);
    }
    productsByCombo.get(key).push(product);
  });

  if (!combos.size) {
    return {
      products: products.map((product) => ({
        ...product,
        available_attributes: []
      })),
      metaByCombo: {}
    };
  }

  const metaByCombo = {};

  for (const [key, combo] of combos.entries()) {
    const productsInCombo = productsByCombo.get(key) || [];
    metaByCombo[key] = await fetchComboAttributes({
      ozon,
      combo,
      productsInCombo,
      language
    });
  }

  const enrichedProducts = products.map((product) => {
    const descriptionCategoryId =
      product?.description_category_id ?? product?.descriptionCategoryId;
    const typeId = product?.type_id ?? product?.typeId;
    const key = buildDescriptionAttributeKey(descriptionCategoryId, typeId);
    return {
      ...product,
      available_attributes: metaByCombo[key] || []
    };
  });

  return { products: enrichedProducts, metaByCombo };
}

export async function fetchDescriptionAttributesForCombo({
  ozon,
  descriptionCategoryId,
  typeId,
  attributes = [],
  language = DEFAULT_LANGUAGE
}) {
  const snapshotProduct = {
    description_category_id: descriptionCategoryId,
    type_id: typeId,
    attributes
  };

  const { products: enrichedProducts, metaByCombo } =
    await enrichProductsWithDescriptionAttributes({
      ozon,
      products: [snapshotProduct],
      language
    });

  const key = buildDescriptionAttributeKey(descriptionCategoryId, typeId);

  return {
    attributes: metaByCombo[key] || [],
    product:
      enrichedProducts && enrichedProducts.length
        ? enrichedProducts[0]
        : snapshotProduct
  };
}

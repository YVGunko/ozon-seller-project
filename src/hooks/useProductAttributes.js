import { useState, useCallback } from 'react';
import { normalizeProductAttributes } from '../utils/attributesHelpers';

export function useProductAttributes(apiClient, currentProfile) {
  const [attributes, setAttributes] = useState(null);
  const [editableAttributes, setEditableAttributes] = useState(null);
  const [loadingAttributes, setLoadingAttributes] = useState(false);
  const [error, setError] = useState(null);

  const loadAttributes = useCallback(
    async (offerId) => {
      if (!currentProfile) {
        const err = new Error('Профиль OZON не выбран');
        setError(err.message);
        throw err;
      }

      setLoadingAttributes(true);
      setError(null);
      try {
        const data = await apiClient.getAttributes(offerId, currentProfile);
        const rawProducts = Array.isArray(data?.result) ? data.result : [];
        const normalized = normalizeProductAttributes(rawProducts);
        // eslint-disable-next-line no-console
        console.log('[attributes] loadAttributes from OZON', {
          offerId,
          profileId: currentProfile.id,
          items: rawProducts.length
        });
        setAttributes(data);
        const editable = JSON.parse(JSON.stringify(normalized));
        setEditableAttributes(editable);
        const rawCopy = JSON.parse(JSON.stringify(rawProducts));
        return {
          editable,
          normalized,
          raw: rawCopy,
          response: data
        };
      } catch (err) {
        console.error('loadAttributes error', err);
        const message = err.message || 'Не удалось загрузить атрибуты';
        setError(message);
        setAttributes({ error: message });
        setEditableAttributes(null);
        throw err;
      } finally {
        setLoadingAttributes(false);
      }
    },
    [apiClient, currentProfile]
  );

  return {
    attributes,
    setAttributes,
    editableAttributes,
    setEditableAttributes,
    loadingAttributes,
    error,
    loadAttributes
  };
}

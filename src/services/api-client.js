// src/services/api-client.js
const getProfileId = (profile) => {
  if (!profile || !profile.id) {
    throw new Error('Не выбран профиль OZON');
  }
  return profile.id;
};

export const apiClient = {
  async getProducts(limit = 20, profile, params = {}) {
    const query = new URLSearchParams();

    query.append('limit', params.limit || limit);
    if (params.last_id) query.append('last_id', params.last_id);
    if (params.offer_id) query.append('offer_id', params.offer_id);
    query.append('profileId', getProfileId(profile));

    const response = await fetch(`/api/products?${query.toString()}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch products: ${text}`);
    }
    return response.json();
  },

  async getAttributes(offer_id, profile = null) {
    if (!profile) {
      throw new Error('Не выбран профиль OZON');
    }
    const query = new URLSearchParams({ offer_id, profileId: getProfileId(profile) });

    const res = await fetch(`/api/products/attributes?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch attributes');
    return res.json();
  },

  async getDescriptionAttributes(params = {}, profile = null) {
    if (!profile) {
      throw new Error('Не выбран профиль OZON');
    }
    const payload = {
      description_category_id: params.description_category_id,
      type_id: params.type_id,
      attributes: params.attributes || [],
      language: params.language || 'DEFAULT',
      profileId: getProfileId(profile)
    };

    const res = await fetch('/api/products/description-attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Failed to fetch description attributes');
    }

    return res.json();
  },

  async copyProduct(sourceOfferId, newOfferId, modifications, profile) {
    const res = await fetch('/api/products/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceOfferId,
        newOfferId,
        modifications,
        profileId: getProfileId(profile)
      })
    });
    if (!res.ok) throw new Error('Failed to copy product');
    return res.json();
  }
};

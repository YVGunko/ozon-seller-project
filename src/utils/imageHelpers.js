export const MAX_IMAGE_COUNT = 30;

const normalizeEntry = (entry) => {
  if (entry === undefined || entry === null) return '';
  if (typeof entry === 'string') return entry.trim();
  if (typeof entry === 'object') {
    const candidate =
      entry.url ||
      entry.source ||
      entry.href ||
      entry.link ||
      entry.value ||
      entry.path ||
      entry.text;
    return candidate ? String(candidate).trim() : '';
  }
  return String(entry).trim();
};

export const normalizeImageList = (value) => {
  if (!value) return [];
  const rawList = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const result = [];

  rawList.forEach((entry) => {
    const normalized = normalizeEntry(entry);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
};

export const normalizePrimaryImage = (value) => {
  if (value === undefined || value === null) return '';
  const normalized = normalizeEntry(value);
  return normalized || '';
};

export const clampImageListToLimit = (images = [], primaryImage = '') => {
  const normalizedImages = Array.isArray(images)
    ? normalizeImageList(images)
    : normalizeImageList([images]);
  const normalizedPrimary = normalizePrimaryImage(primaryImage);
  const limit = normalizedPrimary ? MAX_IMAGE_COUNT - 1 : MAX_IMAGE_COUNT;
  if (limit <= 0) {
    return [];
  }
  if (normalizedImages.length <= limit) {
    return normalizedImages;
  }
  return normalizedImages.slice(0, limit);
};

export const areImageListsEqual = (first = [], second = []) => {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }
  return true;
};

export const hasImages = (value) => {
  return normalizeImageList(value).length > 0;
};

export const ensureImagesPresent = (images = [], contextLabel = 'товар') => {
  const normalized = normalizeImageList(images);
  if (!normalized.length) {
    throw new Error(`Для ${contextLabel} добавьте хотя бы одно изображение`);
  }
  return normalized;
};

export const PRICE_FIELDS = ['price', 'old_price', 'min_price'];

export const DIMENSION_FIELDS = [
  'depth',
  'width',
  'height',
  'dimension_unit',
  'weight',
  'weight_unit'
];

export const REQUIRED_BASE_FIELDS = [...PRICE_FIELDS, ...DIMENSION_FIELDS];

export const NUMERIC_BASE_FIELDS = ['price', 'old_price', 'min_price', 'depth', 'width', 'height', 'weight'];

export const UNIT_FIELDS = ['dimension_unit', 'weight_unit'];

export const BASE_FIELD_LABELS = {
  price: 'Ваша цена, ₽',
  old_price: 'Цена до скидки, ₽',
  min_price: 'Минимальная цена',
  net_price: 'Net price (себестоимость)',
  depth: 'Глубина (depth)',
  width: 'Ширина (width)',
  height: 'Высота (height)',
  dimension_unit: 'Единица измерения габаритов',
  weight: 'Вес',
  weight_unit: 'Единица измерения веса'
};

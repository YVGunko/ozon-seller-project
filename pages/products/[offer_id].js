import { useRouter } from 'next/router';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ProductDetailsPage() {
  const router = useRouter();
  const { offer_id } = router.query;
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProduct = async () => {
      if (!offer_id) return;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          offer_id,
          profileId: router.query.profileId || ''
        });
        const response = await fetch(`/api/products/info-list?${params.toString()}`);
        const data = await response.json();
        const item =
          (Array.isArray(data?.items) && data.items[0]) ||
          (Array.isArray(data?.raw?.items) && data.raw.items[0]) ||
          null;
        setProduct(item);
      } catch (err) {
        setError(err.message || 'Не удалось загрузить товар');
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [offer_id, router.query.profileId]);

  return (
    <div style={{ padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/products" legacyBehavior>
          <a style={{ color: '#0d6efd', textDecoration: 'none' }}>← Назад к товарам</a>
        </Link>
      </div>
      <h1>Карточка товара {offer_id || '—'}</h1>
      {loading && <div style={{ color: '#6c757d' }}>Загрузка...</div>}
      {error && <div style={{ color: '#dc3545' }}>{error}</div>}
      {product && (
        <div style={{ marginBottom: 24 }}>
          <div><strong>Название:</strong> {product.name || '—'}</div>
          <div><strong>Product ID:</strong> {product.id}</div>
          <div><strong>SKU:</strong> {product.sku || '—'}</div>
        </div>
      )}
      <Link href={`/products/${offer_id}/attributes`} legacyBehavior>
        <a
          style={{
            padding: '10px 16px',
            backgroundColor: '#0d6efd',
            color: '#fff',
            borderRadius: 6,
            display: 'inline-block',
            textDecoration: 'none'
          }}
        >
          Перейти к атрибутам
        </a>
      </Link>
    </div>
  );
}

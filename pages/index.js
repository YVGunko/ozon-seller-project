import { useState } from 'react';
import Link from 'next/link';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('products');

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/products?limit=5');
      const data = await response.json();
      setProducts(data.result?.items || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/orders');
      const data = await response.json();
      console.log('Orders:', data);
      // Обработка заказов
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>OZON Seller Dashboard</h1>

      <div style={{ marginBottom: '20px' }}>
        <Link href="/import-excel" passHref>
          <div style={{
            padding: '20px 30px',
            backgroundColor: '#ffc107',
            color: 'black',
            textDecoration: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            minWidth: '200px'
          }}>
            <h3>📊 Импорт из Excel</h3>
            <p>Массовое создание товаров</p>
          </div>
        </Link>
        <a
          href="/products"
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            backgroundColor: '#28a745',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 'bold',
            marginRight: '10px'
          }}
        >
          📦 Управление товарами
        </a>
        <button
          onClick={() => setActiveTab('products')}
          style={{ marginRight: '10px', padding: '10px', backgroundColor: activeTab === 'products' ? '#0070f3' : '#ccc', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          Products
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          style={{ padding: '10px', backgroundColor: activeTab === 'orders' ? '#0070f3' : '#ccc', color: 'white', border: 'none', borderRadius: '5px' }}
        >
          Orders
        </button>
      </div>

      {activeTab === 'products' && (
        <div>
          <button
            onClick={fetchProducts}
            disabled={loading}
            style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Loading...' : 'Get Products'}
          </button>

          {products.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h2>Products ({products.length})</h2>
              {products.map(product => (
                <div key={product.product_id} style={{ border: '1px solid #ddd', margin: '10px 0', padding: '15px', borderRadius: '5px' }}>
                  <h3>Product ID: {product.product_id}</h3>
                  <p>Offer ID: {product.offer_id}</p>
                  <p>Archived: {product.archived ? 'Yes' : 'No'}</p>
                  <p>Discounted: {product.is_discounted ? 'Yes' : 'No'}</p>
                  <p>FBS Stocks: {product.has_fbs_stocks ? 'Yes' : 'No'}</p>
                  <p>FBO Stocks: {product.has_fbo_stocks ? 'Yes' : 'No'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div>
          <button
            onClick={fetchOrders}
            disabled={loading}
            style={{ padding: '10px 20px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Loading...' : 'Get Orders'}
          </button>
          <p style={{ marginTop: '10px' }}>Orders functionality coming soon...</p>
        </div>
      )}
    </div>
  );
}
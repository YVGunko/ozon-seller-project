// pages/index.js
import { useState } from 'react';

export default function Home() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/orders');
      const data = await response.json();
      setOrders(data.result || []);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>OZON Seller Dashboard</h1>
      <button onClick={fetchOrders} disabled={loading}>
        {loading ? 'Loading...' : 'Get Orders'}
      </button>
      
      {orders.map(order => (
        <div key={order.order_id} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
          <h3>Order #{order.order_id}</h3>
          <p>Status: {order.status}</p>
        </div>
      ))}
    </div>
  );
}

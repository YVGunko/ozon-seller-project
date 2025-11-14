import { getCsrfToken, signIn } from 'next-auth/react';
import { useState } from 'react';

export default function SignIn({ csrfToken }) {
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const username = formData.get('username');
    const password = formData.get('password');

    const result = await signIn('credentials', {
      redirect: false,
      username,
      password
    });

    if (result?.error) {
      setError('Неверный логин или пароль');
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        fontFamily: 'Arial, sans-serif'
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: '#fff',
          padding: '30px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '360px'
        }}
      >
        <input name="csrfToken" type="hidden" defaultValue={csrfToken} />
        <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>Вход в систему</h2>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          Логин
          <input
            name="username"
            type="text"
            required
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '5px',
              borderRadius: '4px',
              border: '1px solid #ced4da'
            }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '10px' }}>
          Пароль
          <input
            name="password"
            type="password"
            required
            style={{
              width: '100%',
              padding: '8px',
              marginTop: '5px',
              borderRadius: '4px',
              border: '1px solid #ced4da'
            }}
          />
        </label>
        {error && (
          <div style={{ color: '#dc3545', marginBottom: '10px', fontSize: '14px' }}>{error}</div>
        )}
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Войти
        </button>
      </form>
    </div>
  );
}

SignIn.getInitialProps = async (context) => {
  const csrfToken = await getCsrfToken(context);
  return { csrfToken };
};

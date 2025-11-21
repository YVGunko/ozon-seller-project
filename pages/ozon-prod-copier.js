import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ProfileManager } from '../src/utils/profileManager';

export default function OzonProductCopier() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [originalLink, setOriginalLink] = useState('');
  const [rawDescription, setRawDescription] = useState('');
  const [imageLinksText, setImageLinksText] = useState('');
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setCurrentProfile(ProfileManager.getCurrentProfile());
  }, []);

  const handleFilesChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(selectedFiles);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const imageLinks = imageLinksText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const payload = {
      profileId: currentProfile?.id || null,
      originalLink: originalLink.trim(),
      rawDescription: rawDescription.trim(),
      imageLinks,
      filesCount: files.length
    };
    console.log('[OzonProductCopier] submit payload', payload);
    setStatus('Данные собраны, смотрите консоль для проверки payload.');
  };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/" legacyBehavior>
          <a style={{ color: '#0d6efd', textDecoration: 'none' }}>← Назад</a>
        </Link>
      </div>
      <h1 style={{ marginBottom: 8 }}>Клонирование товаров OZON</h1>
      {currentProfile ? (
        <div style={{ marginBottom: 12, color: '#047857' }}>
          Активный профиль: <strong>{currentProfile.name}</strong>
        </div>
      ) : (
        <div style={{ marginBottom: 12, color: '#b91c1c' }}>Профиль не выбран</div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 16,
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)'
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>
            Оригинальная ссылка на OZON
          </label>
          <input
            type="text"
            value={originalLink}
            onChange={(e) => setOriginalLink(e.target.value)}
            placeholder="https://www.ozon.ru/..."
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 6,
              border: '1px solid #d1d5db'
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>
            Сырые данные описания/характеристик
          </label>
          <textarea
            value={rawDescription}
            onChange={(e) => setRawDescription(e.target.value)}
            rows={8}
            placeholder="Вставьте оригинальный текст или JSON с характеристиками"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 6,
              border: '1px solid #d1d5db',
              fontFamily: 'monospace'
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>
            Ссылки на изображения (по одной в строке)
          </label>
          <textarea
            value={imageLinksText}
            onChange={(e) => setImageLinksText(e.target.value)}
            rows={5}
            placeholder="https://.../image1.jpg\nhttps://.../image2.jpg"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 6,
              border: '1px solid #d1d5db',
              fontFamily: 'monospace'
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>
            Или загрузите файлы
          </label>
          <input type="file" multiple onChange={handleFilesChange} />
          {files.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
              Выбрано файлов: {files.length}
            </div>
          )}
        </div>

        <button
          type="submit"
          style={{
            padding: '10px 16px',
            backgroundColor: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          Сохранить/проверить
        </button>
        {status && <div style={{ marginTop: 8, color: '#047857' }}>{status}</div>}
      </form>
    </div>
  );
}

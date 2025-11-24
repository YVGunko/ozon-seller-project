import { put, list } from '@vercel/blob';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../src/server/authOptions';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '10mb'
  }
};

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res
      .status(500)
      .json({ error: 'BLOB_READ_WRITE_TOKEN is not configured on the server' });
  }

  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const rawFilename = searchParams.get('filename') || 'image';
    const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, '');
    const contentType =
      searchParams.get('contentType') ||
      req.headers['content-type'] ||
      'application/octet-stream';

    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'Можно загружать только изображения' });
    }

    const bodyBuffer = await readRequestBody(req);
    if (!bodyBuffer || bodyBuffer.length === 0) {
      return res.status(400).json({ error: 'Пустой файл' });
    }

    // Вычисляем контент‑хэш, чтобы переиспользовать одно и то же изображение
    const hash = crypto.createHash('sha256').update(bodyBuffer).digest('hex');
    const nameExt = safeFilename.includes('.') ? safeFilename.split('.').pop() : '';
    const typeExt =
      contentType && contentType.includes('/') ? contentType.split('/')[1] : '';
    const ext = (nameExt || typeExt || 'bin').toLowerCase();
    const pathname = `images/${hash}.${ext}`;

    // Пытаемся найти уже загруженный Blob с таким же контентом
    try {
      const existing = await list({
        prefix: pathname,
        limit: 1,
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      const found = existing.blobs.find((blob) => blob.pathname === pathname);
      if (found) {
        return res.status(200).json({
          url: found.url,
          pathname: found.pathname,
          size: found.size,
          reused: true
        });
      }
    } catch (lookupError) {
      console.warn('[blob] failed to lookup existing image, uploading new one', lookupError);
    }

    const blob = await put(pathname, bodyBuffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType,
      addRandomSuffix: false
    });

    return res.status(200).json({
      url: blob.url,
      pathname: blob.pathname,
      size: blob.size,
      reused: false
    });
  } catch (error) {
    console.error('Blob upload error', error);
    return res
      .status(500)
      .json({ error: error?.message || 'Не удалось загрузить изображение' });
  }
}

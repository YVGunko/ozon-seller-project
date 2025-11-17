import { put } from '@vercel/blob';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../src/server/authOptions';

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
    const filename = safeFilename || `image-${Date.now()}.jpg`;
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

    const blob = await put(filename, bodyBuffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType
    });

    return res.status(200).json({
      url: blob.url,
      pathname: blob.pathname,
      size: blob.size
    });
  } catch (error) {
    console.error('Blob upload error', error);
    return res
      .status(500)
      .json({ error: error?.message || 'Не удалось загрузить изображение' });
  }
}

// src/server/db.js
//
// Централизованный PrismaClient для доступа к Postgres (Neon).
// Используем singleton‑паттерн, чтобы в dev‑режиме не плодить подключений.
// Клиент используется из пакета @prisma/client (генерируется Prisma).

import { PrismaClient } from '@prisma/client';

// eslint-disable-next-line no-underscore-dangle
const globalForPrisma = globalThis.__prismaGlobal ?? {};

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['info', 'warn', 'error']
        : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-underscore-dangle
  globalThis.__prismaGlobal = { prisma };
}

export default prisma;

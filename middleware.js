// middleware.js
import { NextResponse } from 'next/server'

export function middleware(request) {
  console.log('Middleware:', request.method, request.url)
  
  // 1. Обработка CORS для API
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  // 2. Логирование и мониторинг
  console.log(`📊 API Request: ${request.method} ${request.nextUrl.pathname}`)

  // 3. Общая проверка для API (но не блокирующая)
  const response = NextResponse.next()
  
  // 4. Добавляем CORS заголовки ко всем ответам
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  return response
}

export const config = {
  matcher: '/api/:path*'
}
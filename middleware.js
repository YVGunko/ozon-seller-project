export { default as middleware } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/((?!auth/signin|api/auth|_next/static|_next/image|favicon.ico|api/ai).*)'
  ]
};

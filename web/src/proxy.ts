import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // If pathname already has a locale prefix, pass through
  if (pathname.startsWith('/en') || pathname.startsWith('/zh')) {
    return NextResponse.next();
  }

  // Root "/" → redirect to /en
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/en', request.url));
  }

  // Unmatched routes (e.g. /auth/login without locale) → add /en
  return NextResponse.redirect(new URL(`/en${pathname}`, request.url));
}

export const config = {
  matcher: [
    // Skip internal Next.js paths
    '/((?!_next|api|favicon.ico).*)',
  ],
};

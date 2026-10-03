import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Static assets live at the site root (public/) and must never be
  // locale-prefixed. Without this guard the catch-all below redirected
  // /hero-stadium.jpg to /en/hero-stadium.jpg, which 404s — silently
  // killing every public image on the site.
  if (
    /\.(jpg|jpeg|png|gif|svg|webp|avif|ico|woff|woff2|ttf|otf|css|js|map|txt|xml|webmanifest)$/i.test(
      pathname,
    )
  ) {
    return NextResponse.next();
  }

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

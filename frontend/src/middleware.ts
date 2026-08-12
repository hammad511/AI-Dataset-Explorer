import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Secure by default: every route requires auth EXCEPT the public whitelist below.
// This means any new page you add is automatically protected.

// Routes that are accessible without authentication
const PUBLIC_PATHS = [
  '/',          // Landing page
  '/login',     // Login page
  '/signup',    // Signup page
  '/explore',   // Explore page (anonymous limit applied client-side)
  '/api/search', // Search API
  '/api/health', // Health checks
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow NextAuth API routes, static files, and next internals
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow whitelisted public pages
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  if (isPublic) {
    return NextResponse.next();
  }

  // For all other routes, require authentication
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Run middleware on every page route (not on /_next/static etc.)
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

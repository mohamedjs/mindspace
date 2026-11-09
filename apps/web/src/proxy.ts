import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isPublic = path === '/sign-in' || path.startsWith('/auth/') || path.startsWith('/toolbar-preview');
  const isApi = path.startsWith('/api/');

  const refreshToken = request.cookies.get('refresh_token')?.value;
  const hasSession = Boolean(refreshToken);

  if (!hasSession && !isPublic && !isApi) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes an expired token and writes the new cookie onto `response`.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path === '/sign-in' || path.startsWith('/auth/');

  // Route handlers authenticate themselves — Bearer token or cookie — and
  // answer with the JSON error envelope. Redirecting them to an HTML sign-in
  // page would hand every non-browser client (the MCP server, any script) a
  // 307 and a login form instead of a 401 it can act on.
  const isApi = path.startsWith('/api/');

  if (!user && !isPublic && !isApi) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};

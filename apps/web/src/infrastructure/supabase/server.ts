import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * For Server Components, Route Handlers and proxy.ts.
 *
 * NOTE Next.js 16: cookies() is async — the sync form was removed. This
 * function must be awaited at every call site.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore when proxy.ts is refreshing the session.
          }
        },
      },
    }
  );
}

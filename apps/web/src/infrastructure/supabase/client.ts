import { createBrowserClient } from '@supabase/ssr';

/**
 * The browser-side client. Sessions live in cookies (not localStorage) so the
 * server can read them too — that is what makes route protection in proxy.ts
 * possible without shipping the app shell to signed-out visitors.
 *
 * createBrowserClient is a singleton internally; calling it repeatedly is safe
 * and returns the same instance.
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

import type { FunctionsPort } from '../../core/ports';
import { PipelineError } from '../../core/errors';
import { supabase } from './client';

/**
 * Edge function calls, with the server's error code preserved.
 *
 * FunctionsHttpError stringifies to a useless "non-2xx status code" — the real
 * reason (insufficient_credits, provider_timeout, byok_required…) is in the
 * response body hanging off `.context`.
 *
 * The *code* is what matters, not the prose: it decides whether the user sees
 * "out of credits" with a top-up button or "the AI took too long" with retry.
 * An adapter that threw a plain Error here would silently collapse the whole
 * error taxonomy back into one generic apology, and nothing would fail loudly
 * to tell you.
 */
export const supabaseFunctions: FunctionsPort & {
  invoke<T>(name: string, body: Record<string, unknown>, options?: { method?: 'GET' }): Promise<T>;
} = {
  async invoke<T>(
    name: string,
    body: Record<string, unknown>,
    options?: { method?: 'GET' }
  ): Promise<T> {
    const { data, error } = await supabase.functions.invoke(
      name,
      options?.method === 'GET' ? { method: 'GET' } : { body }
    );

    if (error) {
      const res = (error as { context?: Response }).context;
      if (res && typeof res.json === 'function') {
        const detail = await res.json().catch(() => null);
        if (detail?.error) {
          throw new PipelineError(
            detail.error,
            detail.message ?? detail.reason ?? detail.error,
            res.status,
            detail
          );
        }
      }
      throw error;
    }

    if (data?.error) {
      throw new PipelineError(data.error, data.message ?? data.reason ?? data.error, 200, data);
    }
    return data as T;
  },
};

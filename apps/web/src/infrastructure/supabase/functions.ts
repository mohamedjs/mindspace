import type { FunctionsPort } from '../../core/ports';
import { PipelineError } from '../../core/errors';
import { supabase } from './client';

/**
 * Edge function calls, proxied through `/api/functions/[name]` to avoid browser CORS
 * preflight errors while preserving exact error codes and HTTP statuses.
 */
export const supabaseFunctions: FunctionsPort & {
  invoke<T>(name: string, body: Record<string, unknown>, options?: { method?: 'GET' }): Promise<T>;
} = {
  async invoke<T>(
    name: string,
    body: Record<string, unknown>,
    options?: { method?: 'GET' }
  ): Promise<T> {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const isGet = options?.method === 'GET';
    const res = await fetch(`/api/functions/${name}`, {
      method: isGet ? 'GET' : 'POST',
      headers,
      ...(isGet ? {} : { body: JSON.stringify(body) }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      if (data?.error) {
        throw new PipelineError(
          data.error,
          data.message ?? data.reason ?? data.error,
          res.status,
          data
        );
      }
      throw new PipelineError('edge_function_error', `HTTP ${res.status}`, res.status, data);
    }

    if (data?.error) {
      throw new PipelineError(data.error, data.message ?? data.reason ?? data.error, 200, data);
    }

    return data as T;
  },
};

import type { User } from '@supabase/supabase-js';
import { adminClient } from './supabase.ts';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }

  toResponse(): Response {
    return json({ error: this.code, message: this.message }, this.status);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function getUserOrThrow(req: Request): Promise<User> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new HttpError(401, 'unauthorized', 'missing Authorization header');

  const token = authHeader.replace('Bearer ', '');
  const { data, error } = await adminClient().auth.getUser(token);

  if (error || !data.user) throw new HttpError(401, 'unauthorized');
  return data.user;
}

import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';

/**
 * The error envelope from docs/fastapi-migration/05-api-contract.md#error-envelope:
 * every non-2xx body is exactly `{ error: <machine_code>, message: <human text> }`.
 * Clients switch on the code, so it has to survive the FastAPI swap verbatim.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string
  ) {
    super(message ?? code);
  }
}

export const noContent = () => new NextResponse(null, { status: 204 });

export const fail = (code: string, status: number, message?: string) =>
  NextResponse.json({ error: code, message: message ?? code }, { status });

/** Wraps a handler so every throw comes back as the envelope, never a stack. */
export function route<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.status, err.message);
      return fail('internal_error', 500, err instanceof Error ? err.message : String(err));
    }
  };
}

/**
 * The caller's access token, or null for "no Bearer credentials offered".
 *
 * Lives here rather than in auth.ts so it can be tested without dragging in
 * next/headers and the Supabase driver.
 */
export function bearerToken(req: Request): string | null {
  return req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

/** Validate at the boundary: anything the client sends goes through a schema. */
export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      'validation_error',
      422,
      parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ')
    );
  }
  return parsed.data;
}

/** PostgREST reports failures in-band rather than throwing. */
export function unwrap<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
}): NonNullable<T> {
  if (result.error) {
    // PGRST116 = .single() matched no rows.
    if (result.error.code === 'PGRST116') throw new ApiError('not_found', 404, result.error.message);
    throw new ApiError('internal_error', 500, result.error.message);
  }
  if (result.data === null) throw new ApiError('not_found', 404, 'no rows returned');
  return result.data as NonNullable<T>;
}

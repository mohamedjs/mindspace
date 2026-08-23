import { ApiError, bearerToken, body, route, unwrap } from './http';
import { z } from 'zod';

/**
 * The route envelope, which every API client — the MCP server included —
 * switches on. Contract: docs/fastapi-migration/05-api-contract.md.
 * No network, no Supabase.
 */

const req = (headers: Record<string, string> = {}, json?: unknown) =>
  new Request('http://x/api/spaces', {
    method: 'POST',
    headers,
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

describe('bearerToken', () => {
  it('reads a well-formed Authorization header, either casing of the scheme', () => {
    expect(bearerToken(req({ authorization: 'Bearer abc.def' }))).toBe('abc.def');
    expect(bearerToken(req({ authorization: 'bearer abc.def' }))).toBe('abc.def');
  });

  it('offers nothing when credentials are absent or malformed', () => {
    expect(bearerToken(req())).toBeNull();
    expect(bearerToken(req({ authorization: 'Bearer' }))).toBeNull();
    expect(bearerToken(req({ authorization: 'Bearer ' }))).toBeNull();
    expect(bearerToken(req({ authorization: 'Basic abc' }))).toBeNull();
    // A second word is not part of the token — it is a malformed header.
    expect(bearerToken(req({ authorization: 'Bearer a b' }))).toBeNull();
  });
});

describe('route', () => {
  it('rejects an unauthenticated request as 401 in the envelope, not a stack', async () => {
    const handler = route(async () => {
      throw new ApiError('unauthorized', 401, 'missing or invalid credentials');
    });
    const res = await handler();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: 'unauthorized',
      message: 'missing or invalid credentials',
    });
  });

  it('turns an unexpected throw into 500 internal_error rather than leaking it', async () => {
    const handler = route(async () => {
      throw new TypeError('undefined is not a function');
    });
    const res = await handler();
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'internal_error',
      message: 'undefined is not a function',
    });
  });
});

describe('body', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('accepts a valid payload', async () => {
    await expect(body(req({}, { name: 'Roadmap' }), schema)).resolves.toEqual({ name: 'Roadmap' });
  });

  it('rejects a bad payload as 422 naming the offending field', async () => {
    await expect(body(req({}, { name: '' }), schema)).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
      message: expect.stringContaining('name'),
    });
  });

  it('rejects a non-JSON body instead of throwing a parse error', async () => {
    await expect(body(req(), schema)).rejects.toMatchObject({ status: 422 });
  });
});

describe('unwrap', () => {
  it('maps PGRST116 (single() matched nothing) to 404, not 500', () => {
    expect(() => unwrap({ data: null, error: { message: 'no rows', code: 'PGRST116' } })).toThrow(
      expect.objectContaining({ code: 'not_found', status: 404 })
    );
  });

  it('treats any other PostgREST error as our fault, not the callers', () => {
    expect(() => unwrap({ data: null, error: { message: 'boom' } })).toThrow(
      expect.objectContaining({ code: 'internal_error', status: 500 })
    );
  });

  it('passes data straight through', () => {
    expect(unwrap({ data: [{ id: '1' }], error: null })).toEqual([{ id: '1' }]);
  });
});

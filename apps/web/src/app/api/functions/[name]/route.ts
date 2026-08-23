import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    const edgeRes = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await edgeRes.json().catch(() => null);
    return NextResponse.json(data ?? {}, { status: edgeRes.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'proxy_error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 500 });
  }

  try {
    const edgeRes = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const data = await edgeRes.json().catch(() => null);
    return NextResponse.json(data ?? {}, { status: edgeRes.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'proxy_error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

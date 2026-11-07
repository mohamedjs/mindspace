import autocannon from 'autocannon';
import { composeApp } from '../apps/api/src/composition.js';

export interface LoadResult {
  title: string;
  durationSeconds: number;
  connections: number;
  requestsTotal: number;
  requestsPerSec: number;
  latencyAvgMs: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  latencyMaxMs: number;
  throughputBytesPerSec: number;
  non2xx: number;
}

export async function runReadNotesBenchmark(duration = 10, connections = 20): Promise<LoadResult> {
  const app = await composeApp({
    RATE_LIMIT_MAX: 500000,
  } as any);

  const address = await app.server.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.server.address() as any).port;

  // 1. Seed user, space and 100 notes
  const email = `load-user-${Date.now()}@example.com`;
  const password = 'StrongPassword123!';

  const signUpRes = await app.server.inject({
    method: 'POST',
    url: '/auth/sign-up',
    payload: { email, password, full_name: 'Load Test User' },
  });
  const { access_token } = signUpRes.json();

  const spaceRes = await app.server.inject({
    method: 'POST',
    url: '/spaces',
    headers: { authorization: `Bearer ${access_token}` },
    payload: { name: 'Load Benchmark Space', emoji: '🚀' },
  });
  const spaceId = spaceRes.json().id;

  // Bulk create 100 notes in the space
  for (let i = 0; i < 100; i++) {
    await app.server.inject({
      method: 'POST',
      url: `/spaces/${spaceId}/notes`,
      headers: { authorization: `Bearer ${access_token}` },
      payload: {
        title: `Benchmark Note ${i + 1}`,
        content: `Detailed content for note ${i + 1} with metadata and text content for benchmark reads.`,
        note_type: 'idea',
        color: '#fef08a',
        x: (i % 10) * 120,
        y: Math.floor(i / 10) * 120,
      },
    });
  }

  // 2. Run autocannon against GET /spaces/:id/notes
  const targetUrl = `http://127.0.0.1:${port}/spaces/${spaceId}/notes`;

  const result = await autocannon({
    url: targetUrl,
    connections,
    duration,
    headers: {
      authorization: `Bearer ${access_token}`,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 500));
  await app.close();

  return {
    title: 'Read-Heavy Notes (GET /spaces/:id/notes)',
    durationSeconds: duration,
    connections,
    requestsTotal: result.requests.total,
    requestsPerSec: result.requests.average,
    latencyAvgMs: result.latency.average,
    latencyP50Ms: result.latency.p50,
    latencyP95Ms: (result.latency as any).p95 ?? (result.latency as any).p90 ?? result.latency.average,
    latencyP99Ms: result.latency.p99,
    latencyMaxMs: result.latency.max,
    throughputBytesPerSec: result.throughput.average,
    non2xx: result.non2xx,
  };
}

if (process.argv[1]?.endsWith('read-notes.ts')) {
  console.log('Running Read-Heavy Notes Benchmark...');
  runReadNotesBenchmark(10, 20)
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

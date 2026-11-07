import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { composeApp, composeWorker } from '../composition.js';

describe('Graceful Shutdown', () => {
  describe('API Server Graceful Shutdown', () => {
    it('allows in-flight requests to complete before closing dependencies', async () => {
      const app = await composeApp();

      // Register a slow endpoint to simulate work in flight
      app.server.get('/slow-work', async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { status: 'completed_slow_work' };
      });

      const address = await app.server.listen({ port: 0, host: '127.0.0.1' });
      const port = (app.server.server.address() as any).port;

      // Start an in-flight request using native http request
      let reqCompleted = false;
      let reqStatusCode: number | undefined;
      let reqBody = '';

      const reqPromise = new Promise<void>((resolve, reject) => {
        const req = http.get(
          {
            hostname: '127.0.0.1',
            port,
            path: '/slow-work',
            agent: false,
            headers: { Connection: 'close' },
          },
          (res) => {
            reqStatusCode = res.statusCode;
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              reqBody += chunk;
            });
            res.on('end', () => {
              reqCompleted = true;
              resolve();
            });
          }
        );
        req.on('error', reject);
      });

      // Wait a bit so the request has entered Fastify route handler
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Initiate graceful shutdown while the request is in flight
      const closePromise = app.close();

      // Wait for in-flight request to finish
      await reqPromise;
      expect(reqCompleted).toBe(true);
      expect(reqStatusCode).toBe(200);
      expect(JSON.parse(reqBody)).toEqual({ status: 'completed_slow_work' });

      // Wait for shutdown to finalize
      await closePromise;

      // Verify that new connections are rejected / server is closed
      await expect(
        new Promise((resolve, reject) => {
          const postCloseReq = http.get(
            {
              hostname: '127.0.0.1',
              port,
              path: '/health',
              agent: false,
              headers: { Connection: 'close' },
            },
            resolve
          );
          postCloseReq.on('error', reject);
        })
      ).rejects.toThrow();
    }, 15000);
  });

  describe('Worker Graceful Shutdown', () => {
    it('stops worker loops, unsubscribes channels, and closes connections', async () => {
      const composed = await composeWorker();

      // Start worker
      await composed.worker.start();

      // Verify stopping worker resolves cleanly
      await expect(composed.close()).resolves.toBeUndefined();

      // Multiple calls to close should be idempotent and not throw
      await expect(composed.close()).resolves.toBeUndefined();
    });
  });
});

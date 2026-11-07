import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { loadConfig } from './platform/config.js';
import { logger } from './platform/logger.js';

const HEALTH_FILE = '/tmp/worker-healthy';

async function main() {
  const config = loadConfig();
  logger.info({ nodeEnv: config.NODE_ENV }, 'MindSpace Worker process started');

  // Mark worker as healthy for docker healthcheck
  writeFileSync(HEALTH_FILE, new Date().toISOString(), 'utf8');

  // Periodically update heartbeat
  const heartbeatTimer = setInterval(() => {
    try {
      writeFileSync(HEALTH_FILE, new Date().toISOString(), 'utf8');
    } catch {
      // Ignore write errors during shutdown
    }
  }, 5000);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, `Worker received ${signal}, shutting down gracefully...`);

    clearInterval(heartbeatTimer);
    if (existsSync(HEALTH_FILE)) {
      try {
        unlinkSync(HEALTH_FILE);
      } catch {
        // Ignore unlink error
      }
    }

    logger.info('Worker shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal(err, 'Fatal error in worker process');
  process.exit(1);
});

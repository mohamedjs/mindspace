import { composeApp } from './composition.js';
import { logger } from './platform/logger.js';

async function main() {
  const app = await composeApp();

  const host = '0.0.0.0';
  const port = app.config.PORT;

  await app.server.listen({ port, host });
  logger.info({ port, host }, `MindSpace API server started on port ${port}`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, `Received ${signal}, shutting down gracefully...`);

    try {
      await app.close();
      logger.info('API server closed successfully');
      process.exit(0);
    } catch (err) {
      logger.error(err, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal(err, 'Fatal error during API startup');
  process.exit(1);
});

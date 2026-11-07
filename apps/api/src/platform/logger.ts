import { pino, Logger } from 'pino';

export interface LoggerOptions {
  level?: string;
}

export function createLogger(options?: LoggerOptions): Logger {
  return pino({
    level: options?.level || process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        'authorization',
        'cookie',
      ],
      censor: '[REDACTED]',
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const logger = createLogger();

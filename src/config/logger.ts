import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: { paths: ['password', 'privateKey', 'otp', 'token', 'secret', 'authorization', '*.password', '*.privateKey', '*.otp', '*.token', 'req.headers.authorization', 'req.body', 'config.headers.Authorization'], censor: '[REDACTED]' },
  ...(process.env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
});

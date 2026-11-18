import { createLogger, format, transports } from 'winston';

const serviceName = process.env.SERVICE_NAME || 'easecontent-api';
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = createLogger({
  level: logLevel,
  defaultMeta: {
    service: serviceName,
    env: process.env.NODE_ENV || 'development',
  },
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [new transports.Console()],
});

export default logger;

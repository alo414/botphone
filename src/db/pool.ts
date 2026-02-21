import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

export const pool = new Pool({
  connectionString: config.database.url,
  max: 10,
});

pool.on('error', (err) => {
  logger.error('Unexpected Postgres pool error', { error: err.message });
});

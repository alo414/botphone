import fs from 'fs';
import path from 'path';
import { pool } from './pool';
import { logger } from '../utils/logger';
import { createApiKey } from './queries/apiKeys';

export async function initDatabase(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await pool.query(schema);
  logger.info('Database schema initialized');

  const { rows } = await pool.query(`SELECT COUNT(*) FROM api_keys WHERE revoked_at IS NULL`);
  if (parseInt(rows[0].count, 10) === 0) {
    const { key } = await createApiKey('default');
    logger.info('Default API key created — save this, it will not be shown again', { key });
  }
}

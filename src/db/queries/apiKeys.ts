import crypto from 'crypto';
import { pool } from '../pool';

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function validateApiKey(key: string): Promise<boolean> {
  const hash = hashKey(key);
  const { rows } = await pool.query(
    `UPDATE api_keys
     SET last_used_at = NOW()
     WHERE key_hash = $1 AND revoked_at IS NULL
     RETURNING id`,
    [hash]
  );
  return rows.length > 0;
}

export async function createApiKey(name: string): Promise<{ id: string; name: string; key: string }> {
  const key = crypto.randomBytes(32).toString('hex');
  const hash = hashKey(key);
  const { rows } = await pool.query(
    `INSERT INTO api_keys (name, key_hash) VALUES ($1, $2) RETURNING id, name`,
    [name, hash]
  );
  return { ...rows[0], key };
}

export async function listApiKeys(): Promise<{ id: string; name: string; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }[]> {
  const { rows } = await pool.query(
    `SELECT id, name, created_at, last_used_at, revoked_at FROM api_keys ORDER BY created_at DESC`
  );
  return rows;
}

export async function revokeApiKey(id: string): Promise<void> {
  await pool.query(`UPDATE api_keys SET revoked_at = NOW() WHERE id = $1`, [id]);
}

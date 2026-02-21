import { pool } from '../pool';

export interface AppSettings {
  provider: 'openai' | 'elevenlabs';
  openai: { voice: string; speed: number };
  elevenlabs: { agentId: string };
}

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'openai',
  openai: { voice: 'ash', speed: 1.2 },
  elevenlabs: { agentId: '' },
};

export async function getSettings(): Promise<AppSettings> {
  const result = await pool.query('SELECT data FROM settings WHERE id = 1');
  if (result.rows.length === 0) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...result.rows[0].data };
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const merged: AppSettings = {
    ...current,
    ...data,
    openai: { ...current.openai, ...(data.openai || {}) },
    elevenlabs: { ...current.elevenlabs, ...(data.elevenlabs || {}) },
  };
  await pool.query(
    `UPDATE settings SET data = $1, updated_at = NOW() WHERE id = 1`,
    [JSON.stringify(merged)]
  );
  return merged;
}

import { pool } from '../pool';
import { CallRecord, CallStatus, CallSummary, TranscriptEntry } from '../../types';

export async function createCall(params: {
  scope: string;
  phone_number: string;
  objective: string;
  context: Record<string, unknown>;
}): Promise<CallRecord> {
  const { rows } = await pool.query(
    `INSERT INTO calls (scope, phone_number, objective, context)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.scope, params.phone_number, params.objective, JSON.stringify(params.context)]
  );
  return rows[0];
}

export async function getCall(id: string): Promise<CallRecord | null> {
  const { rows } = await pool.query('SELECT * FROM calls WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getCallBySid(sid: string): Promise<CallRecord | null> {
  const { rows } = await pool.query('SELECT * FROM calls WHERE twilio_call_sid = $1', [sid]);
  return rows[0] || null;
}

export async function listCalls(params: {
  limit?: number;
  offset?: number;
  status?: CallStatus;
}): Promise<CallRecord[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.status) {
    conditions.push(`status = $${idx++}`);
    values.push(params.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  values.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM calls ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    values
  );
  return rows;
}

export async function updateCallStatus(id: string, status: CallStatus): Promise<void> {
  await pool.query(
    'UPDATE calls SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, id]
  );
}

export async function updateCallObjective(id: string, objective: string): Promise<void> {
  await pool.query(
    'UPDATE calls SET objective = $1, updated_at = NOW() WHERE id = $2',
    [objective, id]
  );
}

export async function updateCallSid(id: string, sid: string): Promise<void> {
  await pool.query(
    'UPDATE calls SET twilio_call_sid = $1, updated_at = NOW() WHERE id = $2',
    [sid, id]
  );
}

export async function updateElevenLabsConversationId(id: string, conversationId: string): Promise<void> {
  await pool.query(
    'UPDATE calls SET elevenlabs_conversation_id = $1, updated_at = NOW() WHERE id = $2',
    [conversationId, id]
  );
}

export async function updateCallSummary(id: string, summary: CallSummary, durationSeconds: number): Promise<void> {
  await pool.query(
    'UPDATE calls SET summary = $1, duration_seconds = $2, status = $3, updated_at = NOW() WHERE id = $4',
    [JSON.stringify(summary), durationSeconds, 'completed', id]
  );
}

export async function insertTranscriptEntry(params: {
  call_id: string;
  role: 'agent' | 'user';
  text: string;
}): Promise<TranscriptEntry> {
  const { rows } = await pool.query(
    `INSERT INTO transcript_entries (call_id, role, text)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [params.call_id, params.role, params.text]
  );
  return rows[0];
}

export async function getTranscript(callId: string): Promise<TranscriptEntry[]> {
  const { rows } = await pool.query(
    'SELECT * FROM transcript_entries WHERE call_id = $1 ORDER BY timestamp ASC',
    [callId]
  );
  return rows;
}

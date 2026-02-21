const BASE = '/api';

export async function pingHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export const AUTH_TOKEN_STORAGE = 'callops_token';

function authHeaders(): Record<string, string> {
  const token = sessionStorage.getItem(AUTH_TOKEN_STORAGE);
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export interface CallRecord {
  id: string;
  scope: string;
  phone_number: string;
  business_name: string | null;
  objective: string;
  context: Record<string, unknown>;
  status: string;
  twilio_call_sid: string | null;
  summary: {
    outcome: string;
    structuredData: Record<string, unknown>;
    transcript: { role: string; text: string }[];
  } | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
  transcript?: TranscriptItem[];
}

export interface TranscriptItem {
  id?: string;
  role: 'agent' | 'user';
  text: string;
  timestamp?: string;
}

export interface CreateCallPayload {
  scope: string;
  placeId?: string;
  phoneNumber?: string;
  objective: string;
  context?: Record<string, unknown>;
}

export async function createCall(payload: CreateCallPayload): Promise<CallRecord> {
  const res = await fetch(`${BASE}/calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listCalls(params?: { limit?: number; offset?: number; status?: string }): Promise<CallRecord[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  if (params?.status) qs.set('status', params.status);
  const res = await fetch(`${BASE}/calls?${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getCall(id: string): Promise<CallRecord> {
  const res = await fetch(`${BASE}/calls/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getLiveTranscript(id: string): Promise<{ transcript: TranscriptItem[] }> {
  const res = await fetch(`${BASE}/calls/${id}/transcript/live`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface AppSettings {
  provider: 'openai' | 'elevenlabs';
  openai: { voice: string; speed: number };
  elevenlabs: { agentId: string };
}

export async function getSettings(): Promise<AppSettings> {
  const res = await fetch(`${BASE}/settings`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function resolvePlace(placeId: string): Promise<{ phoneNumber: string; businessName: string }> {
  const res = await fetch(`${BASE}/calls/places/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ placeId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

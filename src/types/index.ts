export type CallStatus =
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'busy';

export type ScopeName = 'restaurant' | 'general_info' | 'appointment' | 'general';

export interface CallRecord {
  id: string;
  scope: ScopeName;
  phone_number: string;
  objective: string;
  context: Record<string, unknown>;
  status: CallStatus;
  twilio_call_sid: string | null;
  elevenlabs_conversation_id: string | null;
  summary: CallSummary | null;
  duration_seconds: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface TranscriptEntry {
  id: string;
  call_id: string;
  role: 'agent' | 'user';
  text: string;
  timestamp: Date;
}

export interface CreateCallRequest {
  scope: ScopeName;
  placeId?: string;
  phoneNumber?: string;
  objective: string;
  context?: Record<string, unknown>;
}

export interface CallSummary {
  outcome: string;
  structuredData: Record<string, unknown>;
  transcript: { role: string; text: string }[];
}

export interface ScopeDefinition {
  name: ScopeName;
  buildSystemPrompt(objective: string, context: Record<string, unknown>): string;
  initialGreeting(context?: Record<string, unknown>): string;
  summaryExtractionPrompt: string;
  structuredDataSchema: Record<string, string>;
}

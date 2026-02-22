import { config } from '../config';
import { logger } from '../utils/logger';

const BASE_URL = 'https://api.elevenlabs.io/v1/convai';

function headers() {
  return {
    'Content-Type': 'application/json',
    'xi-api-key': config.elevenlabs.apiKey,
  };
}

export interface ElevenLabsOutboundCallResult {
  success: boolean;
  message: string;
  conversation_id?: string;
  callSid?: string;
}

export interface ElevenLabsConversation {
  conversation_id: string;
  agent_id: string;
  status: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed';
  metadata?: {
    start_time_unix_secs?: number;
    call_duration_secs?: number;
    termination_reason?: string;
  };
  analysis?: {
    call_successful?: string;
    transcript_summary?: string;
    data_collection_results?: Record<string, unknown>;
  };
  transcript?: { role: string; time_in_call_secs: number; message: string }[];
}

export async function initiateOutboundCall(params: {
  agentId: string;
  agentPhoneNumberId: string;
  toNumber: string;
  dynamicVariables?: Record<string, string>;
}): Promise<ElevenLabsOutboundCallResult> {
  const body: Record<string, unknown> = {
    agent_id: params.agentId,
    agent_phone_number_id: params.agentPhoneNumberId,
    to_number: params.toNumber,
  };

  if (params.dynamicVariables && Object.keys(params.dynamicVariables).length > 0) {
    body.conversation_initiation_client_data = {
      dynamic_variables: params.dynamicVariables,
    };
  }

  const res = await fetch(`${BASE_URL}/twilio/outbound-call`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    logger.error('ElevenLabs outbound call failed', { status: res.status, body: errBody });
    throw new Error(`ElevenLabs API error ${res.status}: ${errBody}`);
  }

  return res.json() as Promise<ElevenLabsOutboundCallResult>;
}

export async function getConversation(conversationId: string): Promise<ElevenLabsConversation> {
  const res = await fetch(`${BASE_URL}/conversations/${conversationId}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${errBody}`);
  }

  return res.json() as Promise<ElevenLabsConversation>;
}

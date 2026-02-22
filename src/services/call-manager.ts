import * as callQueries from '../db/queries/calls';
import { getSettings } from '../db/queries/settings';
import { createOutboundCall } from './twilio';
import { initiateOutboundCall, getConversation } from './elevenlabs';
import { generateSummary } from './summary';
import { getScope } from '../scopes';
import { logger } from '../utils/logger';

// In-memory store for active call data (transcript, timing)
interface ActiveCall {
  startTime: Date;
  transcript: { role: string; text: string }[];
  ended: boolean;
  pollTimer?: NodeJS.Timeout;
}

const activeCalls = new Map<string, ActiveCall>();

export function getActiveCall(callId: string): ActiveCall | undefined {
  return activeCalls.get(callId);
}

export function setActiveCallTranscript(callId: string, transcript: { role: string; text: string }[]) {
  const active = activeCalls.get(callId);
  if (active) {
    active.transcript = transcript;
  }
}

export async function initiateCall(callId: string): Promise<void> {
  const call = await callQueries.getCall(callId);
  if (!call) throw new Error(`Call not found: ${callId}`);

  const settings = await getSettings();

  activeCalls.set(callId, {
    startTime: new Date(),
    transcript: [],
    ended: false,
  });

  if (settings.provider === 'elevenlabs') {
    await initiateElevenLabsCall(callId, call, settings);
  } else {
    await initiateTwilioCall(callId, call);
  }
}

async function initiateTwilioCall(callId: string, call: { phone_number: string }): Promise<void> {
  try {
    const sid = await createOutboundCall({
      to: call.phone_number,
      callId,
    });

    await callQueries.updateCallSid(callId, sid);
    await callQueries.updateCallStatus(callId, 'ringing');
    logger.info('Call initiated', { callId, sid });
  } catch (err) {
    logger.error('Failed to create outbound call', { callId, error: (err as Error).message });
    await callQueries.updateCallStatus(callId, 'failed');
    activeCalls.delete(callId);
    throw err;
  }
}

async function initiateElevenLabsCall(
  callId: string,
  call: { phone_number: string; objective: string; context: Record<string, unknown>; scope: string },
  settings: { elevenlabs: { agentId: string; agentPhoneNumberId: string } }
): Promise<void> {
  try {
    const scope = getScope(call.scope as any);
    const greeting = (call.context.initialGreeting as string) || scope.initialGreeting(call.context);
    const result = await initiateOutboundCall({
      agentId: settings.elevenlabs.agentId,
      agentPhoneNumberId: settings.elevenlabs.agentPhoneNumberId,
      toNumber: call.phone_number,
      dynamicVariables: {
        objective: call.objective,
        context: JSON.stringify(call.context),
        scope: call.scope,
        initial_greeting: greeting,
      },
    });

    if (result.conversation_id) {
      await callQueries.updateElevenLabsConversationId(callId, result.conversation_id);
    }
    if (result.callSid) {
      await callQueries.updateCallSid(callId, result.callSid);
    }
    await callQueries.updateCallStatus(callId, 'ringing');
    logger.info('ElevenLabs call initiated', { callId, conversationId: result.conversation_id });

    // Start polling for conversation status
    if (result.conversation_id) {
      startElevenLabsPoll(callId, result.conversation_id);
    }
  } catch (err) {
    logger.error('Failed to create ElevenLabs outbound call', { callId, error: (err as Error).message });
    await callQueries.updateCallStatus(callId, 'failed');
    activeCalls.delete(callId);
    throw err;
  }
}

function startElevenLabsPoll(callId: string, conversationId: string): void {
  const active = activeCalls.get(callId);
  if (!active) return;

  const timer = setInterval(async () => {
    try {
      const conv = await getConversation(conversationId);

      // Update transcript from ElevenLabs
      if (conv.transcript && conv.transcript.length > 0) {
        active.transcript = conv.transcript.map(t => ({
          role: t.role === 'agent' ? 'agent' : 'user',
          text: t.message,
        }));
      }

      // Map ElevenLabs status to our status
      if (conv.status === 'in-progress') {
        const call = await callQueries.getCall(callId);
        if (call && call.status !== 'in_progress') {
          await callQueries.updateCallStatus(callId, 'in_progress');
          logger.info('Call status updated', { callId, status: 'in_progress' });
        }
      }

      // Terminal states
      if (conv.status === 'done' || conv.status === 'failed') {
        clearInterval(timer);
        await handleElevenLabsCallEnd(callId, conv);
      }
    } catch (err) {
      logger.error('Error polling ElevenLabs conversation', { callId, conversationId, error: (err as Error).message });
    }
  }, 3000);

  active.pollTimer = timer;
}

async function handleElevenLabsCallEnd(callId: string, conv: Awaited<ReturnType<typeof getConversation>>): Promise<void> {
  const active = activeCalls.get(callId);
  if (!active || active.ended) return;
  active.ended = true;
  if (active.pollTimer) clearInterval(active.pollTimer);

  const call = await callQueries.getCall(callId);
  if (!call) {
    logger.error('Call not found during ElevenLabs end handling', { callId });
    return;
  }

  if (conv.status === 'failed') {
    await callQueries.updateCallStatus(callId, 'failed');
    activeCalls.delete(callId);
    return;
  }

  const transcript = (conv.transcript || []).map(t => ({
    role: (t.role === 'agent' ? 'agent' : 'user') as 'agent' | 'user',
    text: t.message,
  }));

  const durationSeconds = conv.metadata?.call_duration_secs ??
    Math.round((Date.now() - active.startTime.getTime()) / 1000);

  // Save transcript entries to DB
  for (const entry of transcript) {
    await callQueries.insertTranscriptEntry({
      call_id: callId,
      role: entry.role,
      text: entry.text,
    });
  }

  // Generate summary
  try {
    const summary = await generateSummary(call, transcript);
    await callQueries.updateCallSummary(callId, summary, durationSeconds);
    logger.info('ElevenLabs call completed with summary', { callId, durationSeconds });
  } catch (err) {
    logger.error('Failed to generate summary', { callId, error: (err as Error).message });
    await callQueries.updateCallStatus(callId, 'completed');
  }

  activeCalls.delete(callId);
}

export async function handleCallEnd(callId: string, transcript: { role: string; text: string }[]): Promise<void> {
  const active = activeCalls.get(callId);
  if (!active || active.ended) return;
  active.ended = true;

  const call = await callQueries.getCall(callId);
  if (!call) {
    logger.error('Call not found during end handling', { callId });
    return;
  }

  const durationSeconds = Math.round((Date.now() - active.startTime.getTime()) / 1000);

  // Save transcript entries to DB
  for (const entry of transcript) {
    await callQueries.insertTranscriptEntry({
      call_id: callId,
      role: entry.role as 'agent' | 'user',
      text: entry.text,
    });
  }

  // Generate summary
  try {
    const summary = await generateSummary(call, transcript);
    await callQueries.updateCallSummary(callId, summary, durationSeconds);
    logger.info('Call completed with summary', { callId, durationSeconds });
  } catch (err) {
    logger.error('Failed to generate summary', { callId, error: (err as Error).message });
    await callQueries.updateCallStatus(callId, 'completed');
  }

  activeCalls.delete(callId);
}

export async function handleStatusCallback(callId: string, callStatus: string): Promise<void> {
  const statusMap: Record<string, string> = {
    initiated: 'queued',
    ringing: 'ringing',
    'in-progress': 'in_progress',
    completed: 'completed',
    busy: 'busy',
    'no-answer': 'no_answer',
    failed: 'failed',
    canceled: 'failed',
  };

  const mapped = statusMap[callStatus];
  if (!mapped) {
    logger.warn('Unknown Twilio call status', { callId, callStatus });
    return;
  }

  // Don't overwrite completed/failed with earlier statuses
  const call = await callQueries.getCall(callId);
  if (!call) return;
  if (call.status === 'completed' || call.status === 'failed') return;

  await callQueries.updateCallStatus(callId, mapped as any);
  logger.info('Call status updated', { callId, status: mapped });

  // If terminal status without going through media stream, clean up
  if (['busy', 'no_answer', 'failed'].includes(mapped)) {
    const active = activeCalls.get(callId);
    if (active && !active.ended) {
      active.ended = true;
      if (active.pollTimer) clearInterval(active.pollTimer);
      activeCalls.delete(callId);
    }
  }
}

import * as callQueries from '../db/queries/calls';
import { createOutboundCall } from './twilio';
import { generateSummary } from './summary';
import { logger } from '../utils/logger';

// In-memory store for active call data (transcript, timing)
interface ActiveCall {
  startTime: Date;
  transcript: { role: string; text: string }[];
  ended: boolean;
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

  activeCalls.set(callId, {
    startTime: new Date(),
    transcript: [],
    ended: false,
  });

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
      activeCalls.delete(callId);
    }
  }
}

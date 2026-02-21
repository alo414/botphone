import WebSocket from 'ws';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getScope } from '../scopes';
import { CallRecord } from '../types';

interface TranscriptItem {
  role: 'agent' | 'user';
  text: string;
}

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17';
const MAX_CALL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export interface MediaBridgeCallbacks {
  onTranscriptUpdate: (entries: TranscriptItem[]) => void;
  onCallEnd: (transcript: TranscriptItem[]) => void;
}

export function createMediaBridge(
  twilioWs: WebSocket,
  call: CallRecord,
  callbacks: MediaBridgeCallbacks,
  options?: { voice?: string; speed?: number }
) {
  const transcript: TranscriptItem[] = [];
  let streamSid: string | null = null;
  let openaiWs: WebSocket | null = null;
  let callTimeout: NodeJS.Timeout | null = null;
  let greetingSent = false;

  const scope = getScope(call.scope);
  const systemPrompt = scope.buildSystemPrompt(call.objective, call.context, call.business_name || undefined);

  function cleanup() {
    if (callTimeout) clearTimeout(callTimeout);
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
  }

  // Set max call duration timeout
  callTimeout = setTimeout(() => {
    logger.warn('Max call duration reached, ending call', { callId: call.id });
    // Send a wrap-up message to OpenAI
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: '[SYSTEM: The call has been going on for too long. Please wrap up the conversation politely and say goodbye within the next 15 seconds.]',
          }],
        },
      }));
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
    }
    // Force close after 20s grace period
    setTimeout(() => cleanup(), 20000);
  }, MAX_CALL_DURATION_MS);

  // Connect to OpenAI Realtime API
  openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      'Authorization': `Bearer ${config.openai.apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  openaiWs.on('open', () => {
    logger.info('OpenAI Realtime WS connected', { callId: call.id });

    // Configure session — response.create is deferred until session.updated confirms it's ready
    openaiWs!.send(JSON.stringify({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: systemPrompt,
        voice: options?.voice ?? 'ash',
        speed: options?.speed ?? 1.2,
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    }));
  });

  openaiWs.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());

      switch (event.type) {
        case 'response.audio.delta':
          // Forward audio from OpenAI to Twilio
          if (streamSid) {
            twilioWs.send(JSON.stringify({
              event: 'media',
              streamSid,
              media: {
                payload: event.delta,
              },
            }));
          }
          break;

        case 'response.audio_transcript.done':
          // Agent's complete utterance
          if (event.transcript) {
            transcript.push({ role: 'agent', text: event.transcript });
            callbacks.onTranscriptUpdate([...transcript]);
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // User's (business's) transcribed speech
          if (event.transcript) {
            transcript.push({ role: 'user', text: event.transcript });
            callbacks.onTranscriptUpdate([...transcript]);
          }
          break;

        case 'error':
          logger.error('OpenAI Realtime error', { callId: call.id, error: event.error });
          break;

        case 'session.created':
          logger.info('OpenAI session created', { callId: call.id });
          break;

        case 'session.updated':
          logger.info('OpenAI session configured', { callId: call.id });
          // Now that the session is fully configured, kick off the initial greeting (only once)
          if (!greetingSent) {
            greetingSent = true;
            openaiWs!.send(JSON.stringify({
              type: 'response.create',
              response: {
                modalities: ['text', 'audio'],
                instructions: `Begin the call now. ${scope.initialGreeting(call.business_name || undefined)} Your specific objective for this call is: "${call.objective}". Get straight to it after a brief greeting.`,
              },
            }));
          }
          break;
      }
    } catch (err) {
      logger.error('Error processing OpenAI message', { callId: call.id, error: (err as Error).message });
    }
  });

  openaiWs.on('error', (err) => {
    logger.error('OpenAI Realtime WS error', { callId: call.id, error: err.message });
    cleanup();
  });

  openaiWs.on('close', () => {
    logger.info('OpenAI Realtime WS closed', { callId: call.id });
  });

  // Handle Twilio WebSocket messages
  twilioWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'connected':
          logger.info('Twilio media stream connected', { callId: call.id });
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          logger.info('Twilio media stream started', { callId: call.id, streamSid });
          break;

        case 'media':
          // Forward audio from Twilio to OpenAI
          if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: msg.media.payload,
            }));
          }
          break;

        case 'stop':
          logger.info('Twilio media stream stopped', { callId: call.id });
          cleanup();
          callbacks.onCallEnd([...transcript]);
          break;
      }
    } catch (err) {
      logger.error('Error processing Twilio message', { callId: call.id, error: (err as Error).message });
    }
  });

  twilioWs.on('close', () => {
    logger.info('Twilio WS closed', { callId: call.id });
    cleanup();
    callbacks.onCallEnd([...transcript]);
  });

  twilioWs.on('error', (err) => {
    logger.error('Twilio WS error', { callId: call.id, error: err.message });
    cleanup();
  });

  return { cleanup };
}

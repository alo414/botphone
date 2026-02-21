import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { getScope } from '../scopes';
import { CallRecord } from '../types';
import type { MediaBridgeCallbacks } from './media-bridge';

const MAX_CALL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function createElevenLabsBridge(
  twilioWs: WebSocket,
  call: CallRecord,
  callbacks: MediaBridgeCallbacks,
  config: { agentId: string; apiKey: string; isVoicemail?: boolean }
) {
  const transcript: { role: 'agent' | 'user'; text: string }[] = [];
  let streamSid: string | null = null;
  let elWs: WebSocket | null = null;
  let callTimeout: NodeJS.Timeout | null = null;
  let ended = false;

  const scope = getScope(call.scope);
  const basePrompt = scope.buildSystemPrompt(call.objective, call.context, call.business_name || undefined);
  const systemPrompt = config.isVoicemail
    ? `${basePrompt}

IMPORTANT: You have reached a voicemail. Leave your message clearly and concisely — cover the key points of your objective in a single message, then say goodbye and stop speaking. Do not repeat yourself. If the recipient picks up the phone and starts speaking to you during your message, immediately stop and switch to a natural live conversation with them.`
    : basePrompt;

  function cleanup() {
    if (ended) return;
    ended = true;
    if (callTimeout) clearTimeout(callTimeout);
    if (elWs && elWs.readyState === WebSocket.OPEN) {
      elWs.close();
    }
  }

  function finish() {
    if (ended) return;
    cleanup();
    callbacks.onCallEnd([...transcript]);
  }

  callTimeout = setTimeout(() => {
    logger.warn('Max call duration reached (ElevenLabs), ending call', { callId: call.id });
    finish();
  }, MAX_CALL_DURATION_MS);

  const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${encodeURIComponent(config.agentId)}`;

  elWs = new WebSocket(url, {
    headers: {
      'xi-api-key': config.apiKey,
    },
  });

  elWs.on('open', () => {
    logger.info('ElevenLabs WS connected', { callId: call.id });

    // Send conversation initiation with system prompt override
    elWs!.send(JSON.stringify({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
          first_message: config.isVoicemail
            ? `Hi, I'm leaving a message regarding: ${call.objective}. ${scope.initialGreeting(call.business_name || undefined)}`
            : scope.initialGreeting(call.business_name || undefined),
        },
        tts: {
          voice_id: undefined,
        },
      },
      custom_llm_extra_body: {},
    }));
  });

  elWs.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());

      switch (event.type) {
        case 'audio':
          // Forward audio from ElevenLabs to Twilio
          if (streamSid && event.audio_event?.audio_base_64) {
            twilioWs.send(JSON.stringify({
              event: 'media',
              streamSid,
              media: {
                payload: event.audio_event.audio_base_64,
              },
            }));
          }
          break;

        case 'agent_response':
          if (event.agent_response_event?.agent_response) {
            transcript.push({ role: 'agent', text: event.agent_response_event.agent_response });
            callbacks.onTranscriptUpdate([...transcript]);
          }
          break;

        case 'user_transcript':
          if (event.user_transcription_event?.user_transcript) {
            transcript.push({ role: 'user', text: event.user_transcription_event.user_transcript });
            callbacks.onTranscriptUpdate([...transcript]);
          }
          break;

        case 'conversation_ended':
          logger.info('ElevenLabs conversation ended', { callId: call.id });
          finish();
          break;

        case 'error':
          logger.error('ElevenLabs error event', { callId: call.id, error: event });
          break;

        case 'conversation_initiation_metadata':
          logger.info('ElevenLabs conversation initiated', { callId: call.id });
          break;

        case 'ping':
          // Respond to pings to keep connection alive
          if (elWs && elWs.readyState === WebSocket.OPEN) {
            elWs.send(JSON.stringify({ type: 'pong', event_id: event.ping_event?.event_id }));
          }
          break;
      }
    } catch (err) {
      logger.error('Error processing ElevenLabs message', { callId: call.id, error: (err as Error).message });
    }
  });

  elWs.on('error', (err) => {
    logger.error('ElevenLabs WS error', { callId: call.id, error: err.message });
    cleanup();
  });

  elWs.on('close', () => {
    logger.info('ElevenLabs WS closed', { callId: call.id });
  });

  // Handle Twilio WebSocket messages
  twilioWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'connected':
          logger.info('Twilio media stream connected (ElevenLabs bridge)', { callId: call.id });
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          logger.info('Twilio media stream started (ElevenLabs bridge)', { callId: call.id, streamSid });
          break;

        case 'media':
          // Forward audio from Twilio to ElevenLabs
          if (elWs && elWs.readyState === WebSocket.OPEN) {
            elWs.send(JSON.stringify({
              type: 'audio',
              audio_event: {
                audio_base_64: msg.media.payload,
              },
            }));
          }
          break;

        case 'stop':
          logger.info('Twilio media stream stopped (ElevenLabs bridge)', { callId: call.id });
          finish();
          break;
      }
    } catch (err) {
      logger.error('Error processing Twilio message (ElevenLabs bridge)', { callId: call.id, error: (err as Error).message });
    }
  });

  twilioWs.on('close', () => {
    logger.info('Twilio WS closed (ElevenLabs bridge)', { callId: call.id });
    finish();
  });

  twilioWs.on('error', (err) => {
    logger.error('Twilio WS error (ElevenLabs bridge)', { callId: call.id, error: err.message });
    cleanup();
  });

  return { cleanup };
}

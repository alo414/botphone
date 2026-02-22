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
  config: {
    agentId: string;
    apiKey: string;
    isVoicemail?: boolean;
    noAudioHangupDelaySec?: number;
  }
) {
  const NO_AUDIO_HANGUP_DELAY_MS = (config.noAudioHangupDelaySec ?? 30) * 1000;

  const transcript: { role: 'agent' | 'user'; text: string }[] = [];
  let streamSid: string | null = null;
  let elWs: WebSocket | null = null;
  let callTimeout: NodeJS.Timeout | null = null;
  let noAudioHangupTimer: NodeJS.Timeout | null = null;
  let ended = false;
  let audioReceived = false;
  let firstAudioLogged = false;

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
    if (noAudioHangupTimer) clearTimeout(noAudioHangupTimer);
    if (elWs && elWs.readyState === WebSocket.OPEN) {
      elWs.close();
    }
  }

  function finish() {
    if (ended) return;
    cleanup();
    callbacks.onCallEnd([...transcript]);
  }

  function connectElevenLabs() {
    const url = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${encodeURIComponent(config.agentId)}`;

    elWs = new WebSocket(url, {
      headers: {
        'xi-api-key': config.apiKey,
      },
    });

    elWs.on('open', () => {
      logger.info('ElevenLabs WS connected', { callId: call.id });

      elWs!.send(JSON.stringify({
        type: 'conversation_initiation_client_data',
        conversation_config_override: {
          audio: {
            input: { encoding: 'ulaw_8000' },
            output: { encoding: 'ulaw_8000' },
          },
        },
      }));
    });

    elWs.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());

        switch (event.type) {
          case 'audio':
            // Forward audio from ElevenLabs to Twilio (handle both field formats)
            if (!firstAudioLogged) {
              firstAudioLogged = true;
              const keys = Object.keys(event);
              const audioKeys = event.audio ? Object.keys(event.audio) : event.audio_event ? Object.keys(event.audio_event) : [];
              logger.info('ElevenLabs first audio event structure', { callId: call.id, keys, audioKeys });
            }
            const audioPayload = event.audio?.chunk ?? event.audio_event?.audio_base_64;
            if (streamSid && audioPayload) {
              twilioWs.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: {
                  payload: audioPayload,
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
              // Other party spoke — cancel silence timers
              if (!audioReceived) {
                audioReceived = true;
                if (noAudioHangupTimer) clearTimeout(noAudioHangupTimer);
                logger.info('Other party speech detected, cancelling silence timers', { callId: call.id });
              }
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
            logger.info('ElevenLabs conversation initiated', {
              callId: call.id,
              metadata: JSON.stringify(event.conversation_initiation_metadata_event ?? event),
            });
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
  }

  callTimeout = setTimeout(() => {
    logger.warn('Max call duration reached (ElevenLabs), ending call', { callId: call.id });
    finish();
  }, MAX_CALL_DURATION_MS);

  // Connect to ElevenLabs — first_message is controlled by the agent's dashboard config
  connectElevenLabs();

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

          if (!config.isVoicemail) {
            // No-audio hangup: if no speech detected by N seconds, end the call
            noAudioHangupTimer = setTimeout(() => {
              if (!audioReceived && !ended) {
                logger.warn('No audio after hangup delay, ending call (ElevenLabs)', { callId: call.id });
                finish();
              }
            }, NO_AUDIO_HANGUP_DELAY_MS);
          }
          break;

        case 'media':
          // Forward audio from Twilio to ElevenLabs
          if (elWs && elWs.readyState === WebSocket.OPEN) {
            elWs.send(JSON.stringify({
              user_audio_chunk: msg.media.payload,
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

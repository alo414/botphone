import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { twilioToElevenLabs, elevenLabsToTwilio } from '../utils/audio';
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
  // Audio format negotiated by ElevenLabs (from conversation_initiation_metadata)
  let elOutputRate = 24000;
  let elInputRate = 16000;

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
      }));
    });

    elWs.on('message', (data, isBinary) => {
      // Handle binary audio frames — ElevenLabs sends raw PCM
      if (isBinary) {
        if (streamSid) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          const mulawBase64 = elevenLabsToTwilio(buf, elOutputRate);
          twilioWs.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: { payload: mulawBase64 },
          }));
        }
        return;
      }

      try {
        const event = JSON.parse(data.toString());

        switch (event.type) {
          case 'audio': {
            // Forward JSON audio from ElevenLabs to Twilio
            const audioPayload = event.audio?.chunk ?? event.audio_event?.audio_base_64;
            if (streamSid && audioPayload) {
              // Decode base64 PCM, convert to mulaw
              const pcmBuf = Buffer.from(audioPayload, 'base64');
              const mulawBase64 = elevenLabsToTwilio(pcmBuf, elOutputRate);
              twilioWs.send(JSON.stringify({
                event: 'media',
                streamSid,
                media: { payload: mulawBase64 },
              }));
            }
            break;
          }

          case 'agent_response':
            if (event.agent_response_event?.agent_response) {
              transcript.push({ role: 'agent', text: event.agent_response_event.agent_response });
              callbacks.onTranscriptUpdate([...transcript]);
            }
            break;

          case 'user_transcript':
            if (event.user_transcription_event?.user_transcript) {
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

          case 'conversation_initiation_metadata': {
            const meta = event.conversation_initiation_metadata_event ?? event;
            // Parse negotiated audio formats (e.g. "pcm_24000" → 24000)
            const outFmt = meta.agent_output_audio_format;
            const inFmt = meta.user_input_audio_format;
            if (outFmt) {
              const rate = parseInt(outFmt.replace(/\D/g, ''), 10);
              if (rate > 0) elOutputRate = rate;
            }
            if (inFmt) {
              const rate = parseInt(inFmt.replace(/\D/g, ''), 10);
              if (rate > 0) elInputRate = rate;
            }
            logger.info('ElevenLabs conversation initiated', {
              callId: call.id,
              outputFormat: outFmt,
              inputFormat: inFmt,
              elOutputRate,
              elInputRate,
            });
            break;
          }

          case 'ping':
            if (elWs && elWs.readyState === WebSocket.OPEN) {
              elWs.send(JSON.stringify({ type: 'pong', event_id: event.ping_event?.event_id }));
            }
            break;

          default:
            logger.info('ElevenLabs unhandled event', { callId: call.id, type: event.type });
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
            noAudioHangupTimer = setTimeout(() => {
              if (!audioReceived && !ended) {
                logger.warn('No audio after hangup delay, ending call (ElevenLabs)', { callId: call.id });
                finish();
              }
            }, NO_AUDIO_HANGUP_DELAY_MS);
          }
          break;

        case 'media':
          // Convert Twilio mulaw 8kHz → PCM at ElevenLabs' expected input rate, then send
          if (elWs && elWs.readyState === WebSocket.OPEN) {
            const pcmBase64 = twilioToElevenLabs(msg.media.payload, elInputRate);
            elWs.send(JSON.stringify({
              user_audio_chunk: pcmBase64,
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

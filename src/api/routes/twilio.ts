import { Router } from 'express';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import { config } from '../../config';
import { twilioWebhookAuth } from '../../middleware/twilioAuth';
import { logger } from '../../utils/logger';
import { handleStatusCallback, setActiveCallTranscript, handleCallEnd } from '../../services/call-manager';
import { createMediaBridge } from '../../services/media-bridge';
import { createElevenLabsBridge } from '../../services/elevenlabs-bridge';
import * as callQueries from '../../db/queries/calls';
import { getSettings } from '../../db/queries/settings';
import type WebSocket from 'ws';
import type { Request } from 'express';

const router = Router();

// POST /twilio/voice — TwiML webhook, called when the outbound call is answered
router.post('/voice', twilioWebhookAuth, (req, res) => {
  const callId = req.query.callId as string;
  const answeredBy = req.body.AnsweredBy as string | undefined;
  logger.info('TwiML voice webhook hit', { callId, answeredBy });

  const isVoicemail = !!answeredBy && answeredBy.startsWith('machine');
  logger.info(isVoicemail ? 'Voicemail detected, connecting in voicemail mode' : 'Human answered, connecting normally', { callId, answeredBy });

  const response = new VoiceResponse();
  const connect = response.connect();
  const streamUrl = `${config.publicUrl.replace(/^http/, 'ws')}/twilio/media-stream`;
  const stream = connect.stream({ url: streamUrl });
  stream.parameter({ name: 'callId', value: callId });
  if (isVoicemail) {
    stream.parameter({ name: 'voicemail', value: 'true' });
  }

  res.type('text/xml');
  res.send(response.toString());
});

// POST /twilio/status — Status callback from Twilio
router.post('/status', twilioWebhookAuth, async (req, res) => {
  const callId = req.query.callId as string;
  const callStatus = req.body.CallStatus;

  logger.info('Twilio status callback', { callId, callStatus });

  if (callId && callStatus) {
    await handleStatusCallback(callId, callStatus);
  }

  res.sendStatus(200);
});

/**
 * WS handler for /twilio/media-stream — registered on the app in index.ts
 * because express-ws only patches .ws() onto the app, not standalone routers.
 */
export async function handleMediaStream(ws: WebSocket, req: Request) {
  logger.info('Twilio media stream WebSocket connected');

  // Twilio doesn't forward query params on stream WebSocket URLs.
  // Buffer messages and wait for the 'start' event which carries callId via customParameters.
  const buffered: string[] = [];
  const startParams = await new Promise<{ callId: string | null; voicemail: boolean }>((resolve) => {
    const timeout = setTimeout(() => {
      ws.off('message', onMessage);
      resolve({ callId: null, voicemail: false });
    }, 10000);

    function onMessage(data: WebSocket.RawData) {
      const raw = data.toString();
      buffered.push(raw);
      try {
        const msg = JSON.parse(raw);
        if (msg.event === 'start') {
          clearTimeout(timeout);
          ws.off('message', onMessage);
          resolve({
            callId: msg.start?.customParameters?.callId ?? null,
            voicemail: msg.start?.customParameters?.voicemail === 'true',
          });
        }
      } catch {}
    }

    ws.on('message', onMessage);
  });

  const { callId, voicemail: isVoicemail } = startParams;

  if (!callId) {
    logger.error('No callId in media stream WebSocket');
    ws.close();
    return;
  }

  logger.info('Twilio media stream resolved callId', { callId, isVoicemail });

  const call = await callQueries.getCall(callId);
  if (!call) {
    logger.error('Call not found for media stream', { callId });
    ws.close();
    return;
  }

  const callbacks = {
    onTranscriptUpdate: (entries: { role: 'agent' | 'user'; text: string }[]) => {
      setActiveCallTranscript(callId, entries);
    },
    onCallEnd: (transcript: { role: 'agent' | 'user'; text: string }[]) => {
      handleCallEnd(callId, transcript).catch((err) => {
        logger.error('Error handling call end', { callId, error: err.message });
      });
    },
  };

  const settings = await getSettings();
  if (settings.provider === 'elevenlabs') {
    if (!config.elevenlabs.apiKey) {
      logger.warn('ElevenLabs selected but ELEVENLABS_API_KEY is not set; falling back to OpenAI', { callId });
      createMediaBridge(ws, call, callbacks);
    } else {
      logger.info('Using ElevenLabs bridge', { callId, agentId: settings.elevenlabs.agentId, isVoicemail });
      createElevenLabsBridge(ws, call, callbacks, {
        agentId: settings.elevenlabs.agentId,
        apiKey: config.elevenlabs.apiKey,
        isVoicemail,
      });
    }
  } else {
    createMediaBridge(ws, call, callbacks, {
      voice: settings.openai.voice,
      speed: settings.openai.speed,
    });
  }

  // Replay buffered messages so the bridge processes the 'connected' and 'start' events
  for (const raw of buffered) {
    ws.emit('message', Buffer.from(raw));
  }
}

export { router as twilioRouter };
